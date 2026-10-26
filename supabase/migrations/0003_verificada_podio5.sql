-- Prova confirmada pelo site de resultados (gravada pelo servidor): dispensa o print
alter table public.provas add column verificada boolean not null default false;
alter table public.provas alter column print_path drop not null;
alter table public.provas add constraint provas_print_ou_verificada check (print_path is not null or verificada);
create unique index provas_unica on public.provas (user_id, lower(nome_prova), data_prova, dist_cat);

create or replace function public.provas_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.data_prova > current_date then raise exception 'A data da prova não pode ser no futuro'; end if;
  if auth.uid() is null then return new; end if;   -- gravação feita pelo servidor (service role)
  if tg_op = 'INSERT' then
    new.user_id := auth.uid(); new.status := 'pendente'; new.motivo := null; new.verificada := false;
  elsif not is_admin() then
    new.user_id := old.user_id; new.status := 'pendente'; new.motivo := null; new.verificada := old.verificada;
  end if;
  return new;
end $$;

-- prova verificada não pode ser editada pelo corredor (só apagada)
alter policy "editar própria prova" on public.provas using (user_id = auth.uid() and not verificada);

-- Pódio vai até o 5º lugar: bônus geral 20/12/6/4/2 e categoria 10/6/3/2/1
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
where r.status = 'aprovada';

create or replace function public.ranking_campeonato(
  p_ano int, p_sexo text, p_tipo text default 'geral', p_cidade text default null, p_dist text default null
) returns table (user_id uuid, nome text, cidade text, avatar_url text, pontos numeric, provas int, podios int)
language sql stable security invoker set search_path = public as $$
  select v.user_id, v.nome, v.cidade, v.avatar_url,
         sum(case when p_tipo = 'categoria' then v.pts_cat else v.pts_geral end),
         (count(*) filter (where (case when p_tipo = 'categoria' then v.pts_cat else v.pts_geral end) is not null))::int,
         (count(*) filter (where (case when p_tipo = 'categoria' then v.pos_cat else v.pos_geral end) <= 5))::int
  from v_provas v
  where v.ano = p_ano and v.sexo = p_sexo
    and (p_cidade is null or lower(v.cidade) = lower(p_cidade))
    and (p_dist is null or v.dist_cat = p_dist)
  group by v.user_id, v.nome, v.cidade, v.avatar_url
  having sum(case when p_tipo = 'categoria' then v.pts_cat else v.pts_geral end) is not null
  order by 5 desc, 6 desc
  limit 200;
$$;
