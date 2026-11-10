-- Aba "Comunidade" do ranking: todos os corredores cadastrados, mesmo sem prova pontuada
create function public.comunidade(p_ano int, p_cidade text default null)
returns table (user_id uuid, nome text, cidade text, sexo text, avatar_url text, equipe text, provas int, pontos numeric)
language sql stable security invoker set search_path = public as $$
  select p.id, p.nome, p.cidade, p.sexo, p.avatar_url, e.nome,
         (count(v.id) filter (where v.ano = p_ano))::int,
         coalesce(sum(v.pts_geral) filter (where v.ano = p_ano), 0)
  from profiles p
  left join equipes e on e.id = p.equipe_id
  left join v_provas v on v.user_id = p.id
  where not p.suspenso and (p_cidade is null or lower(p.cidade) = lower(p_cidade))
  group by p.id, p.nome, p.cidade, p.sexo, p.avatar_url, e.nome
  order by 8 desc, 2
  limit 500;
$$;
