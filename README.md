# Corrida Rank

Campeonato de corredores de rua, mobile-first (PWA). **Só valem provas**: cada corredor digita o resultado e anexa o print; um administrador confere e aprova. Sem Strava.

## O que tem
- Cadastro com nome, cidade, sexo (para separar os rankings), e-mail e senha, mais foto de perfil.
- **Termo de aceite obrigatório** no cadastro. O aceite fica gravado (`consentimentos`) e a Edge Function `consent-email` envia um e-mail de confirmação ao administrador.
- **Rankings** do campeonato: Geral, Por idade (categoria) e Melhores tempos; filtros por sexo, ano, distância (3/5/10/15/21/42 km) e cidade.
- **Pontuação igual para todos**: `peso × (10 + 100×(inscritos − posição + 1)÷inscritos + bônus de pódio)`. Bônus geral 20/12/6, categoria 10/6/3. Peso: até 7 km ×1, até 16 km ×1,25, até 30 km ×1,75, acima ×2,5.
- **Buscar resultado em site**: o corredor cola o link da página de resultados da prova; a função `buscar-resultado` lê a tabela (HTML, JSON ou CSV), acha o corredor pelo nome ou nº de peito e preenche tempo, posição, inscritos e categoria. O link fica salvo em `fonte_url` e aparece para o administrador. O print continua obrigatório.
- Moderação: toda prova entra "em análise"; o admin vê o print e aprova ou rejeita (com motivo). Editar uma prova a devolve para análise.
- **Selos** bronze/prata/ouro (1/3/5 provas aprovadas) por distância (3, 5, 10, 15, 21, 42 km) e por cidade da prova.
- Cartão para compartilhar os **selos** (Stories), além dos cartões de prova e de ranking. Números decimais usam vírgula.
- Quadro **Como funciona a pontuação** no Ranking, com tabela de pesos e simulador (`regras.js`, mesma fórmula do banco).
- Perfil público com conquistas, melhores tempos e provas; feed das últimas provas.
- **Cartões para compartilhar** (Stories 1080×1920, gerados no aparelho; no celular abre a folha de compartilhamento, no computador baixa a imagem): de uma prova aprovada e da sua posição no ranking (respeita o filtro aberto).
- Ícone do app (PNG 192/512 e Apple) para instalar na tela inicial.
- Aba **Apoie**: canal do YouTube e chave PIX (e-mail), tudo voluntário.
- Excluir conta apaga perfil, provas e prints (direito de exclusão).

## Configurar
1. Crie um projeto no [Supabase](https://supabase.com) e rode `supabase/migrations/0001_init.sql` no SQL Editor.
2. Authentication → Providers → Email: **mantenha "Confirm email" ligado** (evita cadastros com e-mail alheio).
3. E-mail do aceite: crie conta no [Resend](https://resend.com) **com o e-mail dioneioliveirasbs@gmail.com** (o remetente de teste `onboarding@resend.dev` só entrega para o dono da conta) e gere uma API key. Depois:
   ```
   supabase secrets set RESEND_API_KEY=re_...
   supabase functions deploy consent-email
   ```
   ```
   supabase functions deploy buscar-resultado
   ```
   (rode também `supabase/migrations/0002_fonte_resultado.sql`.)
   Opcionais: `ADMIN_EMAIL` (padrão dioneioliveirasbs@gmail.com) e `MAIL_FROM`. Se o envio falhar, o app tenta de novo no próximo acesso do usuário; o aceite continua gravado no banco.
4. Cadastre-se no app com o seu e-mail e então torne-se administrador (SQL Editor):
   ```sql
   insert into admins select id from auth.users where email = 'dioneioliveirasbs@gmail.com';
   ```
5. Edite `config.js`: URL e chave anon do Supabase e, quando tiver, `YOUTUBE_URL`.
6. Hospede esta pasta em HTTPS (GitHub Pages, Netlify, Vercel…).

## Observações
- A validação das regras (pontos, permissões, limites) está no banco; o app só exibe.
- Prints ficam em bucket privado; só usuários logados veem, e apenas os de provas aprovadas (além do dono e do admin).
- Os dados são declarados pelo corredor e conferidos por print: a moderação é o que dá credibilidade ao ranking.

## Busca em sites de resultados: limites
- Funciona com páginas que trazem a tabela no HTML (ou JSON/CSV). Sites que montam a tabela só por JavaScript, PDFs e planilhas não são lidos: o app avisa e o corredor digita à mão.
- Se a página mostra só uma parte da lista (paginação), o total de inscritos pode sair menor; o app avisa e o corredor confere.
- Quando o site não traz a posição na categoria, ela é calculada pela ordem da tabela (avisado na tela).
- A função só abre links `https://` públicos (bloqueia endereços internos), com limite de 5 MB e 12 s.
- Testes do leitor: tabela com Tempo Bruto/Líquido, acentos, entidades HTML, JSON, CSV, paginação e página sem tabela.

## Documentos legais
- [Termos de Uso](termos.html) e [Política de Privacidade](privacidade.html) (v1.0), ligados na tela de cadastro e no Perfil.
- Perfil → "Exportar meus dados" gera um JSON com tudo do usuário (LGPD).
- Tema claro/escuro/automático em Perfil → Aparência; o cartão de convite (aba Apoie) tem QR Code (`qr.js`, gerado com qrcode-generator, MIT).
- Ranking → aba "Comunidade": lista todos os corredores cadastrados (mesmo sem prova pontuada). Migração `0008_comunidade.sql`.
- Envio de prova simplificado: link + nome + nº de peito + print. O site é lido (Chiprun com busca própria; demais sites por tabela/metadados) e nome da prova, data, cidade, distância, posições, categoria e inscritos são preenchidos sozinhos. Resultado confirmado na Chiprun entra aprovado, sem print.

## Social (Etapa C)
Seguir corredores e avisos (🔔 no Ranking), equipes com ranking, hall da fama, faixa de temporada, destaque de provas (admin) e `PATROCINADORES` em `config.js`. Migração: `supabase/migrations/0006_social_equipes_avisos.sql`.

## Qualidade e operação (Etapa D)
- **Testes:** `.github/workflows/tests.yml` roda em PRs e branches (sintaxe dos módulos, `tests/unit.mjs` com as regras de pontuação, manifest). Localmente: `node tests/unit.mjs`.
- **Monitor de erros:** falhas do navegador vão para a tabela `erros_app` (até 5 por visita); a administração vê em Perfil → Administração → 🐞 Erros. Migração `0007_monitor_erros.sql`.

### Ativar o e-mail de aceite (Resend)
1. Crie conta grátis em resend.com e gere uma **API Key**.
2. No Supabase: Edge Functions → Secrets → adicione `RESEND_API_KEY` com a chave.
3. Sem domínio próprio, o Resend só envia para o e-mail da sua própria conta (dioneioliveirasbs@gmail.com), o que basta, pois o aviso vai para você.

### E-mails de confirmação de cadastro (SMTP)
O envio padrão do Supabase tem limite baixo por hora. Para muitos cadastros: Supabase → Authentication → SMTP Settings → use o SMTP do Resend (host `smtp.resend.com`, usuário `resend`, senha = API Key).
