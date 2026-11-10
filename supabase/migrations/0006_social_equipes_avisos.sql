-- Etapa C: seguir corredores, avisos, equipes, hall da fama, destaque de eventos

-- 1) Seguidores
create table public.seguidores (
  seguidor uuid not null references public.profiles(id) on delete cascade,
  seguido  uuid not null references public.profiles(id) on delete cascade,
  criada_em timestamptz not null default now(),
  primary key (seguidor, seguido), check (seguidor <> seguido));
alter table public.seguidores enable row level security;
create policy "ver meus vínculos" on public.seguidores for select to authenticated using (seguidor = auth.uid() or seguido = auth.uid());
create policy "seguir" on public.seguidores for insert to authenticated with check (seguidor = auth.uid() and pode_postar());
create policy "deixar de seguir" on public.seguidores for delete to authenticated using (seguidor = auth.uid());

-- 2) Avisos no app (criados só por gatilhos)
create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null, texto text not null, ref_id uuid,
  lido boolean not null default false, criado_em timestamptz not null default now());
create index avisos_user on public.avisos (user_id, criado_em desc);
alter table public.avisos enable row level security;
create policy "ver meus avisos" on public.avisos for select to authenticated using (user_id = auth.uid());
create policy "marcar lido" on public.avisos for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "apagar meus avisos" on public.avisos for delete to authenticated using (user_id = auth.uid());

create or replace function public.avisar_prova() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if new.status = 'aprovada' and (tg_op = 'INSERT' or old.status is distinct from 'aprovada') then
    select nome into v_nome from profiles where id = new.user_id;
    insert into avisos (user_id, tipo, texto, ref_id)
      select seguidor, 'prova', v_nome || ' registrou: ' || new.nome_prova, new.user_id from seguidores where seguido = new.user_id;
    if tg_op = 'UPDATE' then
      insert into avisos (user_id, tipo, texto, ref_id) values (new.user_id, 'aprovada', 'Sua prova "' || new.nome_prova || '" foi aprovada ✅', new.user_id);
    end if;
  elsif tg_op = 'UPDATE' and new.status = 'rejeitada' and old.status is distinct from 'rejeitada' then
    insert into avisos (user_id, tipo, texto, ref_id) values (new.user_id, 'rejeitada',
      'Sua prova "' || new.nome_prova || '" foi rejeitada' || coalesce(': ' || new.motivo, ''), new.user_id);
  end if;
  return null;
end $$;
create trigger provas_avisos after insert or update of status on public.provas for each row execute function public.avisar_prova();

create or replace function public.avisar_seguidor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into avisos (user_id, tipo, texto, ref_id)
    select new.seguido, 'seguidor', nome || ' começou a seguir você', new.seguidor from profiles where id = new.seguidor;
  return null;
end $$;
create trigger seguidores_avisos after insert on public.seguidores for each row execute function public.avisar_seguidor();

-- 3) Equipes
create table public.equipes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 3 and 40),
  cidade text, dono uuid not null references public.profiles(id) on delete cascade,
  criada_em timestamptz not null default now());
create unique index equipes_nome_unico on public.equipes (lower(btrim(nome)));
alter table public.equipes enable row level security;
create policy "equipes visíveis" on public.equipes for select to authenticated using (true);
create policy "criar equipe" on public.equipes for insert to authenticated with check (dono = auth.uid() and pode_postar());
create policy "editar equipe" on public.equipes for update to authenticated using (dono = auth.uid());
create policy "apagar equipe" on public.equipes for delete to authenticated using (dono = auth.uid());
alter table public.profiles add column equipe_id uuid references public.equipes(id) on delete set null;

create function public.ranking_equipes(p_ano int)
returns table (equipe_id uuid, nome text, cidade text, membros int, pontos numeric)
language sql stable security invoker set search_path = public as $$
  select e.id, e.nome, e.cidade,
         (select count(*)::int from profiles m where m.equipe_id = e.id),
         coalesce(sum(v.pts_geral), 0)
  from equipes e
  join profiles p on p.equipe_id = e.id
  join v_provas v on v.user_id = p.id and v.ano = p_ano
  group by e.id, e.nome, e.cidade
  order by 5 desc, 4 desc limit 100;
$$;

-- 4) Hall da fama: campeão geral de cada ano encerrado, por sexo
create function public.hall_da_fama()
returns table (ano int, sexo text, user_id uuid, nome text, avatar_url text, pontos numeric)
language sql stable security invoker set search_path = public as $$
  select distinct on (t.ano, t.sexo) t.ano, t.sexo, t.user_id, t.nome, t.avatar_url, t.pontos from (
    select v.ano, v.sexo, v.user_id, v.nome, v.avatar_url, sum(v.pts_geral) as pontos
    from v_provas v where v.ano < extract(year from current_date)::int
    group by v.ano, v.sexo, v.user_id, v.nome, v.avatar_url) t
  order by t.ano desc, t.sexo, t.pontos desc;
$$;

-- 5) Destaque de eventos (definido só pela administração)
alter table public.eventos add column destaque boolean not null default false;
create or replace function public.eventos_destaque_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    new.destaque := case when tg_op = 'INSERT' then false else old.destaque end;
  end if;
  return new;
end $$;
create trigger eventos_destaque before insert or update on public.eventos for each row execute function public.eventos_destaque_guard();

-- Exclusão de conta: as novas tabelas caem em cascata via profiles
