import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { compartilharProva, compartilharRanking, compartilharSelos } from "./cartao.js";
import { fmtNum, fmtKm, calcular, peso, PESOS, PODIO_GERAL, PODIO_CATEGORIA, PARTICIPACAO, nivelDe, proximoNivel } from "./regras.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, YOUTUBE_URL, PIX_CHAVE, SHOPEE_LOJA_URL, SHOPEE_AVISO, PRODUTOS, VERSAO_TERMO, TEXTO_TERMO } from "./config.js";

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s), app = $("#app"), tabs = $("#tabs");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toast = m => { const t = $("#toast"); t.textContent = m; t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2800); };

const DIST = [["3k", "3 km", 3], ["5k", "5 km", 5], ["10k", "10 km", 10], ["15k", "15 km", 15], ["21k", "21 km", 21.0975], ["42k", "42 km", 42.195], ["outra", "Outra", null]];
const distNome = c => (DIST.find(d => d[0] === c) || [, c])[1];
const fmtTime = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.round(s % 60);
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
const parseTime = t => { const p = t.trim().split(":").map(Number); if (p.some(isNaN) || p.length < 2 || p.length > 3) return null;
  const s = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; return s > 0 ? s : null; };
const fmtDate = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
const medal = i => ["🥇", "🥈", "🥉"][i] || i + 1;
const avatar = (p, cls = "") => p.avatar_url
  ? `<img class="avatar ${cls}" src="${esc(p.avatar_url)}" alt="">`
  : `<div class="avatar ${cls}">${esc((p.nome || "?")[0].toUpperCase())}</div>`;

const cache = new Map();
let me = null, isAdmin = false, tab = "ranking", stack = [];
const f = { tipo: "geral", sexo: "M", ano: new Date().getFullYear(), dist: "", cidade: "", quem: "todos", cat: "" };

// ---------- Cadastro / login ----------
function authView(signup = false) {
  tabs.hidden = true;
  app.innerHTML = `<div class="hero"><div class="logo">Corrida<br><b>Rank</b></div>
  <p class="sub">O campeonato dos corredores de rua.<br>Aqui só vale prova. Bora pra linha de chegada?</p><div class="strip"></div></div>
  <form id="f" class="card">
    ${signup ? `<input name="nome" placeholder="Seu nome" required minlength="2" maxlength="60" autocomplete="name">
    <input name="cidade" placeholder="Cidade onde mora" required minlength="2" maxlength="60">
    <select name="sexo" required><option value="">Sexo (para separar os rankings)</option><option value="M">Masculino</option><option value="F">Feminino</option></select>` : ""}
    <input name="email" type="email" placeholder="E-mail" required autocomplete="email">
    <input name="password" type="password" placeholder="Senha (mín. 6)" required minlength="6" autocomplete="${signup ? "new-password" : "current-password"}">
    ${signup ? `<div class="termo"><b>Termo de participação</b><p>${esc(TEXTO_TERMO)}</p>
      <label class="check"><input type="checkbox" name="aceite" required> Li, entendi e aceito de livre e espontânea vontade.</label></div>` : ""}
    <div class="err" id="err"></div>
    <button class="btn">${signup ? "Aceitar e criar conta" : "Entrar"}</button>
    <button type="button" class="link" id="sw">${signup ? "Já tenho conta" : "Criar minha conta"}</button>
  </form>`;
  $("#sw").onclick = () => authView(!signup);
  $("#f").onsubmit = async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target));
    const { data, error } = signup
      ? await db.auth.signUp({ email: v.email, password: v.password, options: { data: {
          nome: v.nome.trim(), cidade: v.cidade.trim(), sexo: v.sexo, aceite_versao: VERSAO_TERMO, aceite_texto: TEXTO_TERMO } } })
      : await db.auth.signInWithPassword({ email: v.email, password: v.password });
    if (error) return $("#err").textContent = error.message;
    if (signup && !data.session) { toast("Conta criada! Confirme o e-mail e entre."); authView(false); }
  };
}

// Primeiro acesso: cria o perfil e registra o aceite (dados vindos do cadastro); depois avisa o administrador por e-mail
async function loadProfile(user) {
  let { data } = await db.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const m = user.user_metadata || {};
  if (!data) {
    if (!m.nome || !m.aceite_versao) return null;
    const r = await db.from("profiles").insert({ id: user.id, nome: m.nome, cidade: m.cidade, sexo: m.sexo }).select().single();
    if (r.error) { toast(r.error.message); return null; }
    data = r.data;
  }
  const c = await db.from("consentimentos").select("email_notificado").eq("user_id", user.id).maybeSingle();
  if (!c.data && m.aceite_versao) await db.from("consentimentos").insert({ user_id: user.id, versao: m.aceite_versao, texto: m.aceite_texto || TEXTO_TERMO });
  if (!c.data || !c.data.email_notificado) db.functions.invoke("consent-email").catch(() => {}); // tenta de novo no próximo acesso se falhar
  return data;
}

// ---------- Ranking ----------
async function rankingView() {
  const { data: cidades } = await db.rpc("cidades");
  const chip = (k, v, t) => `<button class="chip ${String(f[k]) === String(v) ? "on" : ""}" data-k="${k}" data-v="${v}">${t}</button>`;
  const anos = [f.ano - 1, f.ano, f.ano + 1].filter(a => a <= new Date().getFullYear());
  const tempos = f.tipo === "tempos";
  if (tempos && !f.dist) f.dist = "5k";
  app.innerHTML = `<h1>🏆 Ranking</h1>
  <div class="chips">${chip("tipo", "geral", "Geral")}${chip("tipo", "categoria", "Por idade")}${chip("tipo", "tempos", "Melhores tempos")}</div>
  <div class="chips">${chip("sexo", "M", "Masculino")}${chip("sexo", "F", "Feminino")}${anos.map(a => chip("ano", a, a)).join("")}</div>
  <div class="chips">${tempos ? "" : chip("dist", "", "Todas")}${DIST.filter(d => d[0] !== "outra").map(d => chip("dist", d[0], d[1])).join("")}</div>
  <select id="cidade"><option value="">🌎 Todas as cidades</option>${(cidades || []).map(c => `<option value="${esc(c.cidade)}" ${f.cidade === c.cidade ? "selected" : ""}>${esc(c.cidade)} (${c.corredores})</option>`).join("")}</select>
  <div class="mebar" id="meBar" hidden></div>
  <div id="list" class="card">Carregando…</div>
  <button class="link" id="comoBtn">❓ Como funciona a pontuação</button>
  <details class="card" id="como"><summary>Como funciona a pontuação</summary>${comoHTML()}</details>`;
  $("#comoBtn").onclick = () => { const d = $("#como"); d.open = true; d.scrollIntoView({ behavior: "smooth", block: "start" }); };
  bindSimulador();
  app.querySelectorAll(".chip").forEach(b => b.onclick = () => { f[b.dataset.k] = isNaN(b.dataset.v) || b.dataset.v === "" ? b.dataset.v : +b.dataset.v; rankingView(); });
  $("#cidade").onchange = e => { f.cidade = e.target.value; rankingView(); };

  const city = f.cidade || null;
  const { data, error } = tempos
    ? await db.rpc("ranking_tempos", { p_dist: f.dist, p_sexo: f.sexo, p_ano: null, p_cidade: city })
    : await db.rpc("ranking_campeonato", { p_ano: f.ano, p_sexo: f.sexo, p_tipo: f.tipo, p_cidade: city, p_dist: f.dist || null });
  const rows = data || [];
  const valor = r => tempos ? fmtTime(r.tempo_s) : fmtNum(r.pontos);
  const podio = rows.slice(0, 3).length === 3 ? `<div class="podio">${[1, 0, 2].map(i => { const r = rows[i]; return `<div class="pd p${i + 1} ${r.user_id === me.id ? "me" : ""}" data-u="${r.user_id}">
      <div class="m">${medal(i)}</div>${avatar(r)}<div class="name">${esc(r.nome.split(" ")[0])}</div><div class="val">${valor(r)}</div><div class="sub">${esc(r.cidade)}</div></div>`; }).join("")}</div>` : "";
  const resto = podio ? rows.slice(3) : rows, off = podio ? 3 : 0;
  $("#list").className = ""; $("#list").innerHTML = error ? `<div class="card empty">${esc(error.message)}</div>` : !rows.length
    ? `<div class="card empty">Ninguém pontuou aqui ainda.<br>Seja o primeiro: envie o resultado de uma prova! 🚀</div>`
    : podio + (resto.length ? `<div class="card">` : "") + resto.map((r, j) => { const i = j + off; return `<div class="row link-row ${r.user_id === me.id ? "me" : ""}" data-u="${r.user_id}">
      <div class="pos">${medal(i)}</div>${avatar(r)}
      <div class="grow"><div class="name">${esc(r.nome)}</div><div class="sub">${esc(r.cidade)}${tempos ? " · " + esc(r.nome_prova) : ` · ${r.provas} prova(s)${r.podios ? " · " + r.podios + " pódio(s)" : ""}`}</div></div>
      <div class="val">${valor(r)}<div class="sub">${tempos ? fmtDate(r.data_prova) : "pts"}</div></div></div>`; }).join("") + (resto.length ? `</div>` : "");
  app.querySelectorAll("[data-u]").forEach(r => r.onclick = () => runnerView(r.dataset.u));
  // Minha posição fixa no topo (acompanha a rolagem); toque leva até a minha linha
  const meIdx = rows.findIndex(r => r.user_id === me.id), bar = $("#meBar");
  if (!error) {
    bar.hidden = false;
    if (meIdx < 0) bar.innerHTML = `<div class="mepos off">—</div>${avatar(me)}<div class="grow"><div class="name">Você ainda não aparece aqui</div><div class="sub">Envie uma prova ou mude os filtros</div></div>`;
    else {
      const m = rows[meIdx], prev = rows[meIdx - 1], nome1 = x => x.nome.split(" ")[0];
      const gap = !prev ? (rows.length > 1 ? "👑 Você lidera!" : "👑 Você é o primeiro!")
        : tempos ? (m.tempo_s === prev.tempo_s ? `Empatado com ${nome1(prev)}` : `faltam ${fmtTime(m.tempo_s - prev.tempo_s)} para passar ${nome1(prev)}`)
        : (Number(m.pontos) === Number(prev.pontos) ? `Empatado com ${nome1(prev)}` : `faltam ${fmtNum(prev.pontos - m.pontos)} pts para passar ${nome1(prev)}`);
      bar.innerHTML = `<div class="mepos">${meIdx + 1}º</div>${avatar(me)}<div class="grow"><div class="name">Você · ${valor(m)}</div><div class="sub">${gap} · de ${rows.length}</div></div><button class="ico" id="shr" aria-label="Compartilhar minha posição">📤</button>`;
      $("#shr").onclick = async e => {
        e.stopPropagation(); const sh = e.currentTarget; sh.disabled = true;
        const filtros = [f.sexo === "M" ? "Masculino" : "Feminino", tempos ? "todos os anos" : f.ano, f.dist ? distNome(f.dist) : "todas as distâncias", f.cidade || "todas as cidades"].join(" · ");
        const r = await compartilharRanking({ titulo: { geral: "Ranking geral", categoria: "Ranking por idade", tempos: "Melhores tempos" }[f.tipo], filtros, tempos, rows, meIdx }).catch(() => "erro");
        sh.disabled = false; const msg = { baixado: "Cartão salvo! Agora é só postar 📲", erro: "Não foi possível gerar o cartão" }[r]; if (msg) toast(msg);
      };
      bar.onclick = () => { const alvo = app.querySelector(".pd.me, .row.me"); if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "center" }); };
    }
  }
}

function comoHTML() {
  return `<div class="como">
  <p><b>Só valem provas</b>, com print conferido. Cada prova aprovada rende pontos assim:</p>
  <ol>
    <li><b>Participação:</b> ${PARTICIPACAO} pontos por concluir a prova.</li>
    <li><b>Posição:</b> 100 × (inscritos − sua posição + 1) ÷ inscritos. O 1º ganha 100; quem chega no meio ganha ~50; o último ganha pouco mais de 0.</li>
    <li><b>Pódio:</b> bônus de ${PODIO_GERAL.join(" / ")} pontos para 1º / 2º / 3º no <i>geral</i> e ${PODIO_CATEGORIA.join(" / ")} na <i>categoria</i>.</li>
    <li><b>Peso da distância:</b> a soma acima é multiplicada pelo peso da prova.</li>
  </ol>
  <table>${PESOS.map(p => `<tr><td>${p[2]}</td><td>×${String(p[1]).replace(".", ",")}</td></tr>`).join("")}</table>
  <p><b>Dois placares:</b> o <i>Geral</i> usa sua posição entre todos os inscritos; o <i>Por idade</i> usa sua posição na sua categoria. Os dois são separados por sexo e por ano. A categoria é opcional: sem ela você pontua só no geral.</p>
  <p><b>Exemplo:</b> 567º de 1.000 numa prova de 5 km = (10 + 43,4) × 1 = <b>53,4 pts</b>.</p>
  <h3>Simule a sua</h3>
  <div class="grid2"><select id="sDist">${DIST.filter(d => d[2]).map(d => `<option value="${d[2]}" ${d[0] === "5k" ? "selected" : ""}>${d[1]}</option>`).join("")}</select>
    <div></div><input id="sIns" type="number" min="1" placeholder="Inscritos (geral)" value="1000"><input id="sPos" type="number" min="1" placeholder="Sua posição" value="567">
    <input id="sInsC" type="number" min="1" placeholder="Inscritos na categoria" value="230"><input id="sPosC" type="number" min="1" placeholder="Posição na categoria" value="125"></div>
  <div id="sOut" class="simout"></div></div>`;
}
function bindSimulador() {
  const calc = () => {
    const km = +$("#sDist").value, g = calcular(km, +$("#sIns").value, +$("#sPos").value, PODIO_GERAL), c = calcular(km, +$("#sInsC").value, +$("#sPosC").value, PODIO_CATEGORIA);
    const n = x => fmtNum(x), linha = (t, r) => r ? `<div class="simrow"><div>${t}<span>(${PARTICIPACAO} + ${n(r.base)}${r.bonus ? " + " + r.bonus + " pódio" : ""}) × ${String(r.peso).replace(".", ",")}</span></div><b>${n(r.total)} pts</b></div>` : `<div class="simrow"><div>${t}<span>preencha inscritos e posição (posição ≤ inscritos)</span></div><b>—</b></div>`;
    $("#sOut").innerHTML = linha("Geral", g) + linha("Por idade", c);
  };
  ["sDist", "sIns", "sPos", "sInsC", "sPosC"].forEach(id => $("#" + id).oninput = calc); calc();
}

// ---------- Perfil público de um corredor ----------
function badges(l) {
  const has = c => l.some(p => p.dist_cat === c), top = l.filter(p => p.pos_geral <= 3 || (p.pos_cat && p.pos_cat <= 3));
  return [[l.length >= 1, "🏁", "Primeira prova"], [l.length >= 5, "🔥", "5 provas"], [l.length >= 10, "💪", "10 provas"],
    [top.length >= 1, "🥇", "Pódio"], [l.some(p => p.pos_geral / p.inscritos <= .1), "⚡", "Top 10%"],
    [has("21k"), "🏃", "Meia maratona"], [has("42k"), "🌍", "Maratonista"], [new Set(l.map(p => p.cidade_prova).filter(Boolean)).size >= 3, "🧭", "3 cidades"]]
    .filter(b => b[0]);
}
// Selos: por distância (as 6 sempre aparecem; bloqueadas até a 1ª prova) e por cidade da prova
function selosDados(l) {
  const dist = DIST.filter(d => d[0] !== "outra").map(d => ({ lab: d[0].toUpperCase(), nome: d[1], n: l.filter(x => x.dist_cat === d[0]).length }));
  const mapa = {};
  l.filter(x => x.cidade_prova && x.cidade_prova.trim()).forEach(x => { const k = x.cidade_prova.trim().toLowerCase(); (mapa[k] ||= { nome: x.cidade_prova.trim(), n: 0 }).n++; });
  return { dist, cid: Object.values(mapa).sort((a, b) => b.n - a.n) };
}
function selosHTML(l, proprio = false) {
  const { dist, cid } = selosDados(l);
  const selo = (anel, nome, n, cls = "") => { const nv = nivelDe(n), prox = proximoNivel(n);
    return `<div class="selo ${nv ? nv[1] : "off"}"><div class="ring ${cls}">${anel}</div><b>${esc(nome)}</b><span>${nv ? nv[2] : "bloqueado"} · ${prox ? n + "/" + prox : n + " ✓"}</span></div>`; };
  return `<h2>Selos por distância</h2><div class="selos">${dist.map(d => selo(d.lab, d.nome, d.n)).join("")}</div>
  <h2>Selos por cidade</h2>${cid.length ? `<div class="selos">${cid.map(c => selo("📍", c.nome, c.n, "pin")).join("")}</div>`
    : `<div class="card empty">Corra provas em cidades diferentes para ganhar selos de cada uma.</div>`}
  <p class="sub center">Bronze: 1 prova · Prata: 3 · Ouro: 5 (aprovadas, na mesma distância ou cidade).</p>
  ${proprio ? `<button class="btn ghost" id="shrSelos" style="margin-bottom:6px">📤 Compartilhar meus selos</button>` : ""}`;
}
function bindSelos(l, p) {
  const b = $("#shrSelos"); if (!b) return;
  b.onclick = async () => {
    b.disabled = true; const d = selosDados(l);
    const r = await compartilharSelos({ nome: p.nome, cidade: p.cidade, avatar_url: p.avatar_url, ...d }).catch(() => "erro");
    b.disabled = false; const msg = { baixado: "Cartão salvo! Agora é só postar 📲", erro: "Não foi possível gerar o cartão" }[r]; if (msg) toast(msg);
  };
}

async function runnerView(uid, back = true) {
  if (back) stack.push(tab);
  const [{ data: p }, { data: l }] = await Promise.all([
    db.from("profiles").select("*").eq("id", uid).maybeSingle(),
    db.from("v_provas").select("*").eq("user_id", uid).order("data_prova", { ascending: false })]);
  if (!p) return toast("Corredor não encontrado");
  const best = DIST.filter(d => d[0] !== "outra").map(d => [d[1], Math.min(...(l || []).filter(x => x.dist_cat === d[0]).map(x => x.tempo_s))]).filter(b => isFinite(b[1]));
  const pts = (l || []).filter(x => x.ano === f.ano).reduce((t, x) => t + Number(x.pts_geral), 0);
  app.innerHTML = `<button class="link" id="bk" style="text-align:left">← Voltar</button>
  <div class="card center">${avatar(p, "big")}<div class="name" style="font-size:20px">${esc(p.nome)}</div><div class="sub">📍 ${esc(p.cidade)} · ${p.sexo === "M" ? "Masculino" : "Feminino"}</div>
  <div class="stats"><div><b>${(l || []).length}</b><span>provas</span></div><div><b>${fmtNum(pts, 0)}</b><span>pts ${f.ano}</span></div><div><b>${(l || []).filter(x => x.pos_geral <= 3 || (x.pos_cat && x.pos_cat <= 3)).length}</b><span>pódios</span></div></div></div>
  ${badges(l || []).length ? `<h2>Conquistas</h2><div class="badges">${badges(l).map(b => `<div class="badge"><div>${b[1]}</div><span>${b[2]}</span></div>`).join("")}</div>` : ""}
  ${selosHTML(l || [], uid === me.id)}
  ${best.length ? `<h2>Melhores tempos</h2><div class="card">${best.map(b => `<div class="row"><div class="grow name">${b[0]}</div><div class="val">${fmtTime(b[1])}</div></div>`).join("")}</div>` : ""}
  <h2>Provas</h2>${(l || []).map(r => provaCard(r)).join("") || `<div class="card empty">Nenhuma prova aprovada ainda</div>`}`;
  $("#bk").onclick = () => { show(stack.pop() || "ranking"); };
  bindPrints(); bindSelos(l || [], p);
}

function provaCard(r, head = "", foot = null) {
  cache.set(r.id, r);
  const share = r.user_id === me.id && r.status !== "pendente" && r.status !== "rejeitada" ? ` · <button class="link inline" data-share="${r.id}">📤 compartilhar</button>` : "";
  const pts = r.pts_geral != null ? `<b style="color:var(--accent)">${fmtNum(r.pts_geral)}</b> pts geral${r.pts_cat != null ? ` · <b style="color:var(--accent)">${fmtNum(r.pts_cat)}</b> pts idade` : ""} · ` : "";
  return `<div class="card"><div class="provahead"><div style="min-width:0"><div class="name">${esc(r.nome_prova)}</div>
  <div class="sub">${head}${fmtDate(r.data_prova)}${r.cidade_prova ? " · " + esc(r.cidade_prova) : ""}</div></div><div class="bib">${r.dist_cat === "outra" ? fmtKm(r.distancia_km) + "K" : r.dist_cat.toUpperCase()}</div></div>
  <div class="stats"><div class="hl"><b>${fmtTime(r.tempo_s)}</b><span>tempo</span></div><div><b>${fmtTime(r.tempo_s / r.distancia_km)}</b><span>min/km</span></div><div><b>${r.pos_geral}º</b><span>de ${r.inscritos}</span></div>
  ${r.pos_cat ? `<div><b>${r.pos_cat}º</b><span>${esc(r.categoria || "categ.")} · ${r.insc_cat}</span></div>` : ""}</div>
  ${foot ?? `<div class="sub">${pts}<button class="link inline" data-print="${esc(r.print_path)}">ver print</button>${share}</div>`}</div>`;
}
function bindPrints() {
  app.querySelectorAll("[data-share]").forEach(b => b.onclick = async () => {
    b.disabled = true; const r = await compartilharProva(cache.get(b.dataset.share), me).catch(() => "erro"); b.disabled = false;
    const msg = { baixado: "Cartão salvo! Agora é só postar 📲", erro: "Não foi possível gerar o cartão" }[r]; if (msg) toast(msg); });
  app.querySelectorAll("[data-print]").forEach(b => b.onclick = async () => {
    const { data, error } = await db.storage.from("prints").createSignedUrl(b.dataset.print, 300);
    if (error) return toast("Não foi possível abrir o print");
    window.open(data.signedUrl, "_blank", "noopener");
  });
}

// ---------- Provas (feed + minhas) ----------
async function provasView() {
  const chip = (v, t) => `<button class="chip ${f.quem === v ? "on" : ""}" data-v="${v}">${t}</button>`;
  app.innerHTML = `<h1>🏁 Provas</h1><div class="chips">${chip("todos", "Últimas da comunidade")}${chip("minhas", "Minhas provas")}</div><div id="box">Carregando…</div>`;
  app.querySelectorAll(".chip").forEach(b => b.onclick = () => { f.quem = b.dataset.v; provasView(); });
  if (f.quem === "minhas") return minhasView();
  const { data } = await db.from("v_provas").select("*").order("data_prova", { ascending: false }).limit(30);
  $("#box").innerHTML = (data || []).map(r => `<div class="feed"><div class="row link-row" data-u="${r.user_id}">${avatar(r)}<div class="grow"><div class="name">${esc(r.nome)}</div><div class="sub">${esc(r.cidade)}</div></div></div>${provaCard(r)}</div>`).join("")
    || `<div class="card empty">Nenhuma prova aprovada ainda.</div>`;
  app.querySelectorAll("[data-u]").forEach(r => r.onclick = () => runnerView(r.dataset.u));
  bindPrints();
}

const STATUS = { pendente: "⏳ Em análise", aprovada: "✅ Aprovada", rejeitada: "❌ Rejeitada" };
async function minhasView() {
  const [{ data }, { data: pv }] = await Promise.all([db.from("provas").select("*").eq("user_id", me.id).order("data_prova", { ascending: false }),
    db.from("v_provas").select("id, pts_geral, pts_cat").eq("user_id", me.id)]);
  const pts = Object.fromEntries((pv || []).map(x => [x.id, x]));
  $("#box").innerHTML = `<button class="btn" id="novo">➕ Enviar resultado de prova</button><div style="height:12px"></div>` +
    ((data || []).map(r => provaCard({ ...r, ...pts[r.id] }, "", `<div style="margin:2px 0 8px"><span class="tag ${r.status}">${STATUS[r.status]}</span></div>${r.motivo ? `<div class="err">Motivo: ${esc(r.motivo)}</div>` : ""}
      <button class="link inline" data-print="${esc(r.print_path)}">ver print</button> · <button class="link inline" data-del="${r.id}" data-path="${esc(r.print_path)}">excluir</button>${r.status === "aprovada" ? ` · <button class="link inline" data-share="${r.id}">📤 compartilhar</button>` : ""}`)).join("")
    || `<div class="card empty">Você ainda não enviou nenhuma prova.<br>Só valem resultados de provas, com print.</div>`);
  $("#novo").onclick = novaProvaView;
  bindPrints();
  app.querySelectorAll("[data-del]").forEach(b => b.onclick = async () => {
    if (!confirm("Excluir esta prova?")) return;
    await db.storage.from("prints").remove([b.dataset.path]);
    await db.from("provas").delete().eq("id", b.dataset.del); minhasView();
  });
}

function novaProvaView() {
  app.innerHTML = `<button class="link" id="bk" style="text-align:left">← Voltar</button><h1>Enviar resultado</h1>
  <div class="card" id="busca"><div class="name">🔎 Buscar resultado em site</div>
    <p class="sub">Cole o link da página de resultados da prova e eu preencho tempo, posição, inscritos e categoria. O print continua obrigatório.</p>
    <input id="bUrl" type="url" placeholder="Link dos resultados (https://...)" autocomplete="off">
    <div class="grid2"><input id="bNome" value="${esc(me.nome)}" placeholder="Seu nome como no site"><input id="bPeito" placeholder="Nº de peito" inputmode="numeric"></div>
    <button type="button" class="btn ghost" id="bGo">Buscar no site</button>
    <button type="button" class="link" id="bGoogle">Não tenho o link: procurar no Google</button>
    <div id="bOut"></div></div>
  <form id="pf" class="card"><input type="hidden" name="fonte_url">
    <input name="nome_prova" placeholder="Nome da prova" required minlength="3" maxlength="120">
    <input name="data_prova" type="date" required max="${new Date().toISOString().slice(0, 10)}">
    <input name="cidade_prova" placeholder="Cidade da prova">
    <select name="dist_cat" required>${DIST.map(d => `<option value="${d[0]}" ${d[0] === "5k" ? "selected" : ""}>${d[1]}</option>`).join("")}</select>
    <input name="km" id="km" type="number" step="0.01" min="1" max="250" placeholder="Distância em km" hidden>
    <input name="tempo" placeholder="Tempo oficial (h:mm:ss ou mm:ss)" required pattern="\\d{1,2}(:\\d{2}){1,2}" inputmode="numeric">
    <div class="grid2"><input name="inscritos" type="number" min="1" placeholder="Inscritos (geral)" required><input name="pos_geral" type="number" min="1" placeholder="Posição geral" required></div>
    <input name="categoria" placeholder="Categoria, ex.: M 35-39 (opcional)">
    <div class="grid2"><input name="insc_cat" type="number" min="1" placeholder="Inscritos categ."><input name="pos_cat" type="number" min="1" placeholder="Posição categ."></div>
    <label class="filebox">📸 Print do resultado (obrigatório)<input name="print" type="file" accept="image/*" required></label>
    <p class="sub">O print precisa mostrar seu nome, tempo e colocação. Ele será conferido antes de valer pontos.</p>
    <div class="err" id="err"></div><button class="btn">Enviar para aprovação</button></form>`;
  $("#bk").onclick = () => provasView();
  const form = $("#pf"), set = (n, v) => { if (v != null) form.elements[n].value = v; };
  $("#bGoogle").onclick = () => {
    const q = form.elements.nome_prova.value.trim(); if (q.length < 3) return toast("Digite primeiro o nome da prova, no formulário abaixo");
    window.open("https://www.google.com/search?q=" + encodeURIComponent(q + " resultados classificação"), "_blank", "noopener");
  };
  $("#bGo").onclick = async () => {
    const out = $("#bOut"), btn = $("#bGo"), url = $("#bUrl").value.trim();
    if (!/^https:\/\//i.test(url)) return out.innerHTML = `<div class="err">Cole um link que comece com https://</div>`;
    btn.disabled = true; btn.textContent = "Buscando…"; out.innerHTML = "";
    const { data, error } = await db.functions.invoke("buscar-resultado", { body: { url, nome: $("#bNome").value.trim(), peito: $("#bPeito").value.trim() } });
    btn.disabled = false; btn.textContent = "Buscar no site";
    let msg = data?.erro; if (!msg && error) { try { msg = (await error.context.json()).erro; } catch { msg = "Não foi possível consultar o site agora."; } }
    if (msg) return out.innerHTML = `<div class="err">${esc(msg)}</div>`;
    if (!data.candidatos.length) return out.innerHTML = `<div class="err">${esc(data.aviso || "Não encontrei seu nome nessa página.")}</div>`;
    out.innerHTML = `<p class="sub">Toque no seu resultado para preencher o formulário:</p>` + data.candidatos.map((c, i) => `<button type="button" class="cand" data-i="${i}">
      <div class="name">${esc(c.nome)}${c.peito ? " · nº " + esc(c.peito) : ""}</div>
      <div class="sub">${fmtTime(c.tempo_s)} · ${c.pos_geral}º de ${c.inscritos}${c.categoria ? ` · ${esc(c.categoria)}: ${c.pos_cat}º de ${c.insc_cat}` : ""}</div>
      ${c.parcial ? `<div class="warn">⚠️ A página parece paginada; o total de inscritos pode ser maior.</div>` : ""}
      ${c.pos_geral_calculada ? `<div class="warn">Posição geral calculada pela ordem da tabela.</div>` : ""}${c.pos_cat_calculada ? `<div class="warn">Posição na categoria calculada pela ordem da tabela.</div>` : ""}
      ${c.sexo && c.sexo !== me.sexo ? `<div class="warn">⚠️ O resultado indica sexo ${c.sexo === "M" ? "masculino" : "feminino"}, diferente do seu perfil.</div>` : ""}</button>`).join("");
    out.querySelectorAll(".cand").forEach(b => b.onclick = () => {
      const c = data.candidatos[+b.dataset.i];
      set("tempo", fmtTime(c.tempo_s)); set("inscritos", c.inscritos); set("pos_geral", c.pos_geral);
      set("categoria", c.categoria ?? ""); set("insc_cat", c.insc_cat ?? ""); set("pos_cat", c.pos_cat ?? ""); set("fonte_url", data.fonte);
      if (!form.elements.nome_prova.value.trim() && data.titulo) set("nome_prova", data.titulo.slice(0, 120));
      out.querySelectorAll(".cand").forEach(x => x.classList.toggle("on", x === b));
      toast("Preenchido! Confira com o print e complete data e distância."); form.scrollIntoView({ behavior: "smooth" });
    });
  };
  const sel = app.querySelector("[name=dist_cat]");
  sel.onchange = () => { $("#km").hidden = sel.value !== "outra"; $("#km").required = sel.value === "outra"; };
  $("#pf").onsubmit = async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.target)), n = x => x === "" || x == null ? null : +x;
    const tempo = parseTime(v.tempo), file = e.target.print.files[0], btn = e.target.querySelector(".btn");
    const err = m => $("#err").textContent = m;
    if (!tempo) return err("Tempo inválido. Use h:mm:ss ou mm:ss.");
    if (+v.pos_geral > +v.inscritos) return err("A posição não pode ser maior que o total de inscritos.");
    if ((v.insc_cat === "") !== (v.pos_cat === "")) return err("Preencha inscritos e posição da categoria juntos, ou deixe os dois vazios.");
    if (n(v.pos_cat) > n(v.insc_cat)) return err("A posição na categoria não pode ser maior que os inscritos dela.");
    if (!file) return err("O print é obrigatório.");
    btn.disabled = true; err("");
    const path = `${me.id}/${crypto.randomUUID()}.jpg`;
    const up = await db.storage.from("prints").upload(path, await toJpeg(file, 1600), { contentType: "image/jpeg" });
    if (up.error) { btn.disabled = false; return err(up.error.message); }
    const km = v.dist_cat === "outra" ? +v.km : DIST.find(d => d[0] === v.dist_cat)[2];
    const { error } = await db.from("provas").insert({ nome_prova: v.nome_prova.trim(), data_prova: v.data_prova, cidade_prova: v.cidade_prova.trim() || null,
      dist_cat: v.dist_cat, distancia_km: km, tempo_s: tempo, inscritos: +v.inscritos, pos_geral: +v.pos_geral,
      categoria: v.categoria.trim() || null, insc_cat: n(v.insc_cat), pos_cat: n(v.pos_cat), print_path: path, user_id: me.id, fonte_url: v.fonte_url || null });
    if (error) { await db.storage.from("prints").remove([path]); btn.disabled = false; return err(error.message); }
    toast("Enviado! Assim que for aprovado, entra no ranking."); f.quem = "minhas"; provasView();
  };
}

// ---------- Loja (Shopee) ----------
function lojaView() {
  const cats = [...new Set(PRODUTOS.map(p => p.categoria).filter(Boolean))];
  const chip = (v, t) => `<button class="chip ${f.cat === v ? "on" : ""}" data-v="${esc(v)}">${esc(t)}</button>`;
  const lista = PRODUTOS.filter(p => !f.cat || p.categoria === f.cat);
  app.innerHTML = `<h1>🛒 Loja do corredor</h1>
  <p class="sub">Produtos de corrida de rua que eu indico, direto na Shopee.</p>
  ${SHOPEE_LOJA_URL ? `<a class="btn" style="display:block;text-decoration:none;margin:12px 0" href="${esc(SHOPEE_LOJA_URL)}" target="_blank" rel="noopener sponsored">Ver minha conta na Shopee</a>` : ""}
  ${cats.length ? `<div class="chips">${chip("", "Todos")}${cats.map(c => chip(c, c)).join("")}</div>` : ""}
  ${lista.length ? `<div class="loja">${lista.map(p => `<a class="prod" href="${esc(p.url)}" target="_blank" rel="noopener sponsored">
    ${p.imagem ? `<img src="${esc(p.imagem)}" alt="" loading="lazy">` : `<div class="ph">🏃</div>`}
    <div class="pn">${esc(p.titulo)}</div>${p.preco ? `<div class="pp">${esc(p.preco)}</div>` : ""}<div class="pb">Ver na Shopee ›</div></a>`).join("")}</div>`
    : `<div class="card empty">Os produtos entram em breve. 🛍️</div>`}
  <p class="sub center" style="margin-top:14px">${esc(SHOPEE_AVISO)}</p>`;
  app.querySelectorAll(".chip").forEach(b => b.onclick = () => { f.cat = b.dataset.v; lojaView(); });
}

// ---------- Apoie ----------
function apoieView() {
  app.innerHTML = `<h1>💛 Apoie o projeto</h1>
  <p class="sub">O Corrida Rank é feito de corredor para corredor. Se quiser incentivar, fique à vontade — é totalmente opcional.</p>
  <div class="card center"><div style="font-size:34px">▶️</div><div class="name">Canal no YouTube</div><p class="sub">Treinos, provas e bastidores.</p>
    ${YOUTUBE_URL ? `<a class="btn" style="display:block;text-decoration:none" href="${esc(YOUTUBE_URL)}" target="_blank" rel="noopener">Abrir canal</a>` : `<button class="btn ghost" disabled>Em breve</button>`}</div>
  <div class="card center"><div style="font-size:34px">💸</div><div class="name">Doe via PIX</div><p class="sub">Qualquer valor ajuda. Chave PIX (e-mail):</p>
    <div class="pix">${esc(PIX_CHAVE)}</div><button class="btn" id="cp">Copiar chave PIX</button>
    <p class="sub">Abra o app do seu banco → PIX → Pagar com chave → cole a chave. Doações são voluntárias e não dão vantagem no ranking.</p></div>`;
  $("#cp").onclick = async () => { try { await navigator.clipboard.writeText(PIX_CHAVE); toast("Chave PIX copiada ✅"); } catch { toast(PIX_CHAVE); } };
}

// ---------- Perfil ----------
async function perfilView() {
  const { data: l } = await db.from("v_provas").select("*").eq("user_id", me.id);
  app.innerHTML = `<h1>👤 Meu perfil</h1>
  <div class="card center">${avatar(me, "big")}<label class="link" style="display:block">Trocar foto<input id="photo" type="file" accept="image/*" hidden></label>
    <div class="name">${esc(me.nome)}</div><div class="sub">📍 ${esc(me.cidade)}</div>
    ${badges(l || []).length ? `<div class="badges" style="margin-top:10px">${badges(l).map(b => `<div class="badge"><div>${b[1]}</div><span>${b[2]}</span></div>`).join("")}</div>` : ""}</div>
  ${selosHTML(l || [], true)}
  <form id="pf" class="card" style="margin-top:14px"><input name="nome" value="${esc(me.nome)}" required minlength="2" maxlength="60"><input name="cidade" value="${esc(me.cidade)}" required minlength="2" maxlength="60">
    <select name="sexo"><option value="M" ${me.sexo === "M" ? "selected" : ""}>Masculino</option><option value="F" ${me.sexo === "F" ? "selected" : ""}>Feminino</option></select>
    <button class="btn">Salvar</button></form>
  ${isAdmin ? `<button class="btn" id="adm" style="margin-bottom:10px">🛡️ Aprovar provas</button>` : ""}
  <button class="btn ghost" id="out" style="margin-bottom:10px">Sair</button>
  <button class="link" id="del" style="color:#ff6b6b">Excluir minha conta e meus dados</button>`;
  bindSelos(l || [], me);
  $("#photo").onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    const path = `${me.id}/avatar.jpg`;
    const up = await db.storage.from("avatars").upload(path, await toJpeg(file, 256, true), { upsert: true, contentType: "image/jpeg" });
    if (up.error) return toast(up.error.message);
    const url = db.storage.from("avatars").getPublicUrl(path).data.publicUrl + "?v=" + Date.now();
    await db.from("profiles").update({ avatar_url: url }).eq("id", me.id); me.avatar_url = url; perfilView();
  };
  $("#pf").onsubmit = async e => {
    e.preventDefault(); const v = Object.fromEntries(new FormData(e.target));
    const { error } = await db.from("profiles").update({ nome: v.nome.trim(), cidade: v.cidade.trim(), sexo: v.sexo }).eq("id", me.id);
    if (error) return toast(error.message); Object.assign(me, v); toast("Perfil salvo ✅");
  };
  $("#out").onclick = () => db.auth.signOut();
  if (isAdmin) $("#adm").onclick = adminView;
  $("#del").onclick = async () => {
    if (!confirm("Isso apaga sua conta, suas provas e seus prints, e não pode ser desfeito. Continuar?")) return;
    const { data: ps } = await db.from("provas").select("print_path").eq("user_id", me.id);
    if (ps?.length) await db.storage.from("prints").remove(ps.map(p => p.print_path));
    await db.storage.from("avatars").remove([`${me.id}/avatar.jpg`]);
    const { error } = await db.rpc("excluir_minha_conta");
    if (error) return toast(error.message);
    await db.auth.signOut(); toast("Conta excluída.");
  };
}

// ---------- Administração ----------
async function adminView() {
  app.innerHTML = `<button class="link" id="bk" style="text-align:left">← Voltar</button><h1>🛡️ Provas em análise</h1><div id="box">Carregando…</div>`;
  $("#bk").onclick = () => perfilView();
  const { data } = await db.from("provas").select("*, profiles(nome, cidade, sexo)").eq("status", "pendente").order("created_at");
  $("#box").innerHTML = (data || []).map(r => provaCard(r, r.profiles ? `${esc(r.profiles.nome)} (${esc(r.profiles.cidade)}, ${esc(r.profiles.sexo)}) · ` : "", `<button class="link inline" data-print="${esc(r.print_path)}">ver print</button>${r.fonte_url ? ` · <a class="link inline" href="${esc(r.fonte_url)}" target="_blank" rel="noopener">🔎 ver fonte</a>` : ""}
    <div class="grid2" style="margin-top:8px"><button class="btn" data-ok="${r.id}">Aprovar</button><button class="btn ghost" data-no="${r.id}">Rejeitar</button></div>`)).join("")
    || `<div class="card empty">Nada pendente 🎉</div>`;
  bindPrints();
  app.querySelectorAll("[data-ok]").forEach(b => b.onclick = async () => { await db.from("provas").update({ status: "aprovada", motivo: null }).eq("id", b.dataset.ok); adminView(); });
  app.querySelectorAll("[data-no]").forEach(b => b.onclick = async () => {
    const motivo = prompt("Motivo da rejeição (o corredor verá):"); if (motivo === null) return;
    await db.from("provas").update({ status: "rejeitada", motivo: motivo.trim() || "Print não confere com os dados informados" }).eq("id", b.dataset.no); adminView(); });
}

// ---------- Utilidades ----------
function toJpeg(file, max, square = false) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"), s = square ? Math.min(img.width, img.height) : 1, k = Math.min(1, max / Math.max(img.width, img.height));
      if (square) { c.width = c.height = max; c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, max, max); }
      else { c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); }
      c.toBlob(b => b ? res(b) : rej(new Error("imagem inválida")), "image/jpeg", .82);
    };
    img.onerror = () => rej(new Error("imagem inválida"));
    img.src = URL.createObjectURL(file);
  });
}

const views = { ranking: rankingView, provas: provasView, loja: lojaView, apoie: apoieView, perfil: perfilView };
function show(t) {
  tab = t; stack = [];
  tabs.querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  views[t]();
}
tabs.querySelectorAll("button").forEach(b => b.onclick = () => show(b.dataset.tab));

db.auth.onAuthStateChange(async (_e, session) => {
  if (!session) { me = null; return authView(); }
  me = await loadProfile(session.user);
  if (!me) { toast("Não foi possível concluir o cadastro. Entre novamente."); await db.auth.signOut(); return; }
  isAdmin = !!(await db.rpc("is_admin")).data;
  tabs.hidden = false; show(tab);
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
