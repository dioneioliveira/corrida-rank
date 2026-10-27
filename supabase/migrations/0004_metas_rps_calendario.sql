-- Metas pessoais (só o dono vê)
create table public.metas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('tempo', 'distancia', 'provas')),
  dist_cat text check (dist_cat in ('3k', '5k', '10k', '15k', '21k', '42k')),
  tempo_s int check (tempo_s between 60 and 345600),
  qtd int check (qtd between 1 and 100),
  ano int check (ano between 2020 and 2100),
  prazo date,
  criada_em timestamptz not null default now(),
  check ((tipo = 'tempo' and dist_cat is not null and tempo_s is not null)
      or (tipo = 'distancia' and dist_cat is not null)
      or (tipo = 'provas' and qtd is not null and ano is not null))
);
create index on public.metas (user_id);

-- RPs de treino informados pelo corredor (não valem pontos; aparecem no perfil como "informado")
create table public.rps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dist_cat text not null check (dist_cat in ('3k', '5k', '10k', '15k', '21k', '42k')),
  tempo_s int not null check (tempo_s between 60 and 345600),
  data_rp date not null check (data_rp >= date '2000-01-01'),
  nota text check (char_length(nota) <= 80),
  criado_em timestamptz not null default now()
);
create index on public.rps (user_id);

-- Calendário de provas anunciadas pelos corredores ("Vamos nesta?")
create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  nome text not null check (char_length(nome) between 3 and 120),
  data_evento date not null,
  cidade text not null check (char_length(cidade) between 2 and 60),
  distancias text[] not null default '{}' check (cardinality(distancias) <= 8 and distancias <@ array['3k','5k','10k','15k','21k','42k','outra']),
  link text check (link is null or (link ~ '^https://' and char_length(link) <= 500)),
  obs text check (char_length(obs) <= 300),
  criado_em timestamptz not null default now()
);
create index on public.eventos (data_evento);

create table public.evento_presencas (
  evento_id uuid not null references public.eventos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('vou', 'talvez')),
  criado_em timestamptz not null default now(),
  primary key (evento_id, user_id)
);

-- Anti-spam e data válida: não anunciar prova no passado, no máximo 5 anúncios por dia
create function public.eventos_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.data_evento < current_date then raise exception 'A data da prova já passou'; end if;
    if auth.uid() is not null then
      new.user_id := auth.uid();
      if (select count(*) from eventos where user_id = auth.uid() and criado_em > now() - interval '1 day') >= 5 then
        raise exception 'Limite de 5 anúncios por dia';
      end if;
    end if;
  elsif auth.uid() is not null then
    new.user_id := old.user_id;
  end if;
  return new;
end $$;
create trigger eventos_guard before insert or update on public.eventos for each row execute function public.eventos_guard();

alter table public.metas enable row level security;
alter table public.rps enable row level security;
alter table public.eventos enable row level security;
alter table public.evento_presencas enable row level security;

create policy "metas: dono" on public.metas for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "rps: ver" on public.rps for select to authenticated using (true);
create policy "rps: criar" on public.rps for insert to authenticated with check (user_id = auth.uid());
create policy "rps: editar" on public.rps for update to authenticated using (user_id = auth.uid());
create policy "rps: apagar" on public.rps for delete to authenticated using (user_id = auth.uid());
create policy "eventos: ver" on public.eventos for select to authenticated using (true);
create policy "eventos: criar" on public.eventos for insert to authenticated with check (user_id = auth.uid());
create policy "eventos: editar" on public.eventos for update to authenticated using (user_id = auth.uid());
create policy "eventos: apagar" on public.eventos for delete to authenticated using (user_id = auth.uid() or is_admin());
create policy "presencas: ver" on public.evento_presencas for select to authenticated using (true);
create policy "presencas: criar" on public.evento_presencas for insert to authenticated with check (user_id = auth.uid());
create policy "presencas: editar" on public.evento_presencas for update to authenticated using (user_id = auth.uid());
create policy "presencas: apagar" on public.evento_presencas for delete to authenticated using (user_id = auth.uid());

revoke all on public.metas, public.rps, public.eventos, public.evento_presencas from anon;
