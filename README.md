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
- Aba **Loja** com produtos de corrida de rua da Shopee: preencha `SHOPEE_LOJA_URL` e a lista `PRODUTOS` em `config.js` (título, link, preço, imagem e categoria opcionais). Há um aviso de link de afiliado configurável (`SHOPEE_AVISO`).
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
