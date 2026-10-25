-- Link do site de resultados usado para preencher a prova (ajuda o administrador a conferir)
alter table public.provas add column fonte_url text check (fonte_url is null or (fonte_url ~ '^https://' and char_length(fonte_url) <= 600));
