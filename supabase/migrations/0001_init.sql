-- Corrida Rank: campeonato de provas de rua. Resultados digitados pelos corredores, com print obrigatório, aprovados por um administrador.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 60),
  cidade text not null check (char_length(cidade) between 2 and 60),
  sexo text not null check (sexo in ('M', 'F')),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Registro do aceite (disclaimer). O e-mail ao administrador é disparado pela Edge Function consent-email.
create table public.consentimentos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  versao text not null,
  texto text not null,
  aceito_em timestamptz not null default now(),
  email_notificado boolean not null default false
);

create table public.admins (user_id uuid primary key references auth.users(id) on delete cascade);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

create table public.provas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  nome_prova text not null check (char_length(nome_prova) between 3 and 120),
  data_prova date not null,
  cidade_prova text,
  dist_cat text not null check (dist_cat in ('3k', '5k', '10k', '15k', '21k', '42k', 'outra')),
  distancia_km numeric(6,2) not null check (distancia_km between 1 and 250),
  tempo_s int not null check (tempo_s between 60 and 345600),
  inscritos int not null check (inscritos >= 1),
  pos_geral int not null check (pos_geral >= 1),
  categoria text,
  insc_cat int check (insc_cat >= 1),
  pos_cat int check (pos_cat >= 1),
  print_path text not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'rejeitada')),
  motivo text,
  created_at timestamptz not null default now(),
  check (pos_geral <= inscritos),
  check ((insc_cat is null) = (pos_cat is null)),
  check (pos_cat is null or pos_cat <= insc_cat)
);
create index on public.provas (user_id);
create index on public.provas (status, data_prova desc);

-- Regras de segurança dos dados enviados
create function public.provas_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.data_prova > current_date then raise exception 'A data da prova não pode ser no futuro'; end if;
  if tg_op = 'INSERT' then
    new.user_id := auth.uid(); new.status := 'pendente'; new.motivo := null;
  elsif not is_admin() then   -- quem edita a própria prova volta para a fila de aprovação
    new.user_id := old.user_id; new.status := 'pendente'; new.motivo := null;
  end if;
  return new;
end $$;
create trigger provas_guard before insert or update on public.provas
  for each row execute function public.provas_guard();

alter table public.profiles enable row level security;
alter table public.consentimentos enable row level security;
alter table public.admins enable row level security;
alter table public.provas enable row level security;

create policy "perfis visíveis" on public.profiles for select to authenticated using (true);
create policy "criar próprio perfil" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "editar próprio perfil" on public.profiles for update to authenticated using (id = auth.uid());

create policy "ver próprio aceite" on public.consentimentos for select to authenticated using (user_id = auth.uid());
create policy "registrar próprio aceite" on public.consentimentos for insert to authenticated
  with check (user_id = auth.uid() and email_notificado = false);

create policy "ver provas" on public.provas for select to authenticated
  using (status = 'aprovada' or user_id = auth.uid() or is_admin());
create policy "enviar prova" on public.provas for insert to authenticated with check (user_id = auth.uid());
create policy "editar própria prova" on public.provas for update to authenticated using (user_id = auth.uid());
create policy "admin modera" on public.provas for update to authenticated using (is_admin());
create policy "apagar própria prova" on public.provas for delete to authenticated using (user_id = auth.uid() or is_admin());

-- Pontuação (mesma regra para todos): (10 + 100*(inscritos-pos+1)/inscritos + bônus de pódio) * peso da distância
create view public.v_provas with (security_invoker = true) as
select r.id, r.user_id, p.nome, p.cidade, p.sexo, p.avatar_url,
       r.nome_prova, r.data_prova, extract(year from r.data_prova)::int as ano, r.cidade_prova,
       r.dist_cat, r.distancia_km, r.tempo_s, r.inscritos, r.pos_geral, r.categoria, r.insc_cat, r.pos_cat, r.print_path,
       round(w.peso * (10 + 100.0 * (r.inscritos - r.pos_geral + 1) / r.inscritos
         + case r.pos_geral when 1 then 20 when 2 then 12 when 3 then 6 else 0 end), 1) as pts_geral,
       case when r.pos_cat is null then null else
         round(w.peso * (10 + 100.0 * (r.insc_cat - r.pos_cat + 1) / r.insc_cat
         + case r.pos_cat when 1 then 10 when 2 then 6 when 3 then 3 else 0 end), 1) end as pts_cat
from public.provas r
join public.profiles p on p.id = r.user_id
cross join lateral (select case when r.distancia_km <= 7 then 1.0 when r.distancia_km <= 16 then 1.25
                                when r.distancia_km <= 30 then 1.75 else 2.5 end as peso) w
where r.status = 'aprovada';

-- Campeonato: p_tipo = 'geral' | 'categoria'
create function public.ranking_campeonato(
  p_ano int, p_sexo text, p_tipo text default 'geral', p_cidade text default null, p_dist text default null
) returns table (user_id uuid, nome text, cidade text, avatar_url text, pontos numeric, provas int, podios int)
language sql stable security invoker set search_path = public as $$
  select v.user_id, v.nome, v.cidade, v.avatar_url,
         sum(case when p_tipo = 'categoria' then v.pts_cat else v.pts_geral end),
         (count(*) filter (where (case when p_tipo = 'categoria' then v.pts_cat else v.pts_geral end) is not null))::int,
         (count(*) filter (where (case when p_tipo = 'categoria' then v.pos_cat else v.pos_geral end) <= 3))::int
  from v_provas v
  where v.ano = p_ano and v.sexo = p_sexo
    and (p_cidade is null or lower(v.cidade) = lower(p_cidade))
    and (p_dist is null or v.dist_cat = p_dist)
  group by v.user_id, v.nome, v.cidade, v.avatar_url
  having sum(case when p_tipo = 'categoria' then v.pts_cat else v.pts_geral end) is not null
  order by 5 desc, 6 desc
  limit 200;
$$;

-- Melhores tempos por distância
create function public.ranking_tempos(
  p_dist text, p_sexo text, p_ano int default null, p_cidade text default null
) returns table (user_id uuid, nome text, cidade text, avatar_url text, tempo_s int, nome_prova text, data_prova date)
language sql stable security invoker set search_path = public as $$
  select * from (
    select distinct on (v.user_id) v.user_id, v.nome, v.cidade, v.avatar_url, v.tempo_s, v.nome_prova, v.data_prova
    from v_provas v
    where v.dist_cat = p_dist and v.sexo = p_sexo
      and (p_ano is null or v.ano = p_ano)
      and (p_cidade is null or lower(v.cidade) = lower(p_cidade))
    order by v.user_id, v.tempo_s
  ) t order by tempo_s limit 200;
$$;

create function public.cidades() returns table (cidade text, corredores int)
language sql stable security invoker set search_path = public as $$
  select cidade, count(*)::int from profiles group by cidade order by 2 desc, 1 limit 200;
$$;

-- Direito de exclusão: apaga a conta e tudo que está ligado a ela
create function public.excluir_minha_conta() returns void
language sql security definer set search_path = public as $$
  delete from auth.users where id = auth.uid();
$$;

-- Fotos (públicas) e prints das provas (privados, visíveis só para logados e apenas de provas aprovadas)
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('prints', 'prints', false) on conflict do nothing;

create policy "avatar leitura" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "print upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'prints' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "print apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'prints' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));
create policy "print leitura" on storage.objects for select to authenticated
  using (bucket_id = 'prints' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()
         or exists (select 1 from public.provas p where p.print_path = name and p.status = 'aprovada')));
