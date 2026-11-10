-- Monitor de erros do app: o navegador registra falhas; só a administração lê
create table public.erros_app (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  mensagem text not null check (char_length(mensagem) <= 500),
  origem text check (char_length(origem) <= 300),
  agente text check (char_length(agente) <= 200),
  criado_em timestamptz not null default now());
alter table public.erros_app enable row level security;
create policy "registrar erro" on public.erros_app for insert to authenticated with check (user_id is null or user_id = auth.uid());
create policy "admin lê erros" on public.erros_app for select to authenticated using (is_admin());
create policy "admin limpa erros" on public.erros_app for delete to authenticated using (is_admin());
