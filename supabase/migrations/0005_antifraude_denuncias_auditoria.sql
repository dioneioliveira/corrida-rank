-- 1) Nº de peito único POR PROVA (evento) + suspensão de usuários
alter table public.profiles add column suspenso boolean not null default false, add column suspenso_motivo text;
alter table public.provas add column peito text check (peito is null or peito ~ '^[0-9]{1,8}$'), add column evento_chave text;

create or replace function public.provas_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.data_prova > current_date then raise exception 'A data da prova não pode ser no futuro'; end if;
  -- identidade da prova = endereço do evento no site de resultados, sem parâmetros (ex.: chiprun.com.br/evento/1a-corrida-a-gazeta-2026)
  new.evento_chave := case when new.fonte_url is null then null
    else rtrim(lower(regexp_replace(regexp_replace(new.fonte_url, '^https?://', ''), '[?#].*$', '')), '/') end;
  if auth.uid() is null then return new; end if;   -- gravação feita pelo servidor (service role)
  if tg_op = 'INSERT' then
    new.user_id := auth.uid(); new.status := 'pendente'; new.motivo := null; new.verificada := false;
  elsif not is_admin() then
    new.user_id := old.user_id; new.status := 'pendente'; new.motivo := null; new.verificada := old.verificada;
  end if;
  return new;
end $$;

update public.provas set fonte_url = fonte_url where fonte_url is not null;
create unique index provas_peito_unico on public.provas (evento_chave, peito)
  where peito is not null and evento_chave is not null and status <> 'rejeitada';

create or replace function public.pode_postar() returns boolean
language sql stable security definer set search_path = public as $$
  select not coalesce((select suspenso from profiles where id = auth.uid()), false);
$$;
alter policy "enviar prova" on public.provas with check (user_id = auth.uid() and pode_postar());
alter policy "eventos: criar" on public.eventos with check (user_id = auth.uid() and pode_postar());
alter policy "presencas: criar" on public.evento_presencas with check (user_id = auth.uid() and pode_postar());

create function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then new.suspenso := old.suspenso; new.suspenso_motivo := old.suspenso_motivo; end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();
create policy "admin edita perfis" on public.profiles for update to authenticated using (is_admin());

-- usuários suspensos somem dos rankings
create or replace view public.v_provas with (security_invoker = true) as
select r.id, r.user_id, p.nome, p.cidade, p.sexo, p.avatar_url,
       r.nome_prova, r.data_prova, extract(year from r.data_prova)::int as ano, r.cidade_prova,
       r.dist_cat, r.distancia_km, r.tempo_s, r.inscritos, r.pos_geral, r.categoria, r.insc_cat, r.pos_cat, r.print_path,
       round(w.peso * (10 + 100.0 * (r.inscritos - r.pos_geral + 1) / r.inscritos
         + case r.pos_geral when 1 then 20 when 2 then 12 when 3 then 6 when 4 then 4 when 5 then 2 else 0 end), 1) as pts_geral,
       case when r.pos_cat is null then null else
         round(w.peso * (10 + 100.0 * (r.insc_cat - r.pos_cat + 1) / r.insc_cat
         + case r.pos_cat when 1 then 10 when 2 then 6 when 3 then 3 when 4 then 2 when 5 then 1 else 0 end), 1) end as pts_cat,
       r.verificada, r.fonte_url
from public.provas r
join public.profiles p on p.id = r.user_id
cross join lateral (select case when r.distancia_km <= 7 then 1.0 when r.distancia_km <= 16 then 1.25
                                when r.distancia_km <= 30 then 1.75 else 2.5 end as peso) w
where r.status = 'aprovada' and not p.suspenso;

-- 2) Denúncias
create table public.denuncias (
  id uuid primary key default gen_random_uuid(),
  denunciante uuid not null references public.profiles(id) on delete cascade,
  alvo_tipo text not null check (alvo_tipo in ('prova', 'evento', 'perfil')),
  alvo_id uuid not null,
  motivo text not null check (char_length(motivo) between 5 and 300),
  status text not null default 'aberta' check (status in ('aberta', 'resolvida', 'descartada')),
  criada_em timestamptz not null default now(),
  resolvida_em timestamptz,
  resolvida_por uuid references public.profiles(id) on delete set null,
  unique (denunciante, alvo_tipo, alvo_id)
);
create index on public.denuncias (status, criada_em desc);
create function public.denuncias_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.denunciante := coalesce(auth.uid(), new.denunciante); new.status := 'aberta'; new.resolvida_em := null; new.resolvida_por := null;
    if (select count(*) from denuncias where denunciante = new.denunciante and criada_em > now() - interval '1 day') >= 10 then
      raise exception 'Limite de 10 denúncias por dia';
    end if;
  elsif auth.uid() is not null and is_admin() then
    if new.status <> old.status then new.resolvida_em := now(); new.resolvida_por := auth.uid(); end if;
  end if;
  return new;
end $$;
create trigger denuncias_guard before insert or update on public.denuncias for each row execute function public.denuncias_guard();
alter table public.denuncias enable row level security;
create policy "denuncias: criar" on public.denuncias for insert to authenticated with check (denunciante = auth.uid() and pode_postar());
create policy "denuncias: ver" on public.denuncias for select to authenticated using (denunciante = auth.uid() or is_admin());
create policy "denuncias: tratar" on public.denuncias for update to authenticated using (is_admin());

-- 3) Auditoria das ações da administração
create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  acao text not null,
  alvo_tipo text,
  alvo_id text,
  detalhe text,
  criada_em timestamptz not null default now()
);
create index on public.auditoria (criada_em desc);
alter table public.auditoria enable row level security;
create policy "auditoria: ver" on public.auditoria for select to authenticated using (is_admin());
create policy "auditoria: registrar" on public.auditoria for insert to authenticated with check (is_admin() and admin_id = auth.uid());

-- 4) Limite de uso da função de busca (só o servidor acessa)
create table public.uso_funcao (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  funcao text not null,
  criada_em timestamptz not null default now()
);
create index on public.uso_funcao (user_id, funcao, criada_em desc);
alter table public.uso_funcao enable row level security;
revoke all on public.uso_funcao from anon, authenticated;
revoke all on public.denuncias, public.auditoria from anon;
