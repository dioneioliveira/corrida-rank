// Metas pessoais e RPs (recordes pessoais). A lógica de progresso é pura (testável); as funções de tela recebem o contexto do app.
export const DIST_FIXAS = [["3k", "3 km"], ["5k", "5 km"], ["10k", "10 km"], ["15k", "15 km"], ["21k", "21 km"], ["42k", "42 km"]];
const nomeDist = c => (DIST_FIXAS.find(d => d[0] === c) || [, c])[1];
const fmt = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
const dataBR = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR");

// Melhor marca por distância: considera provas aprovadas e RPs informados (de treino)
export function melhores(provas, rps) {
  return DIST_FIXAS.map(([cat, nome]) => {
    const cand = [
      ...provas.filter(p => p.dist_cat === cat).map(p => ({ tempo_s: p.tempo_s, origem: "prova", data: p.data_prova, detalhe: p.nome_prova })),
      ...rps.filter(r => r.dist_cat === cat).map(r => ({ tempo_s: r.tempo_s, origem: "informado", data: r.data_rp, detalhe: r.nota || "RP de treino", id: r.id }))];
    cand.sort((a, b) => a.tempo_s - b.tempo_s);
    return { cat, nome, melhor: cand[0] || null, melhorProva: cand.find(x => x.origem === "prova") || null };
  });
}

export function textoMeta(m) {
  return m.tipo === "tempo" ? `${nomeDist(m.dist_cat)} abaixo de ${fmt(m.tempo_s)}`
    : m.tipo === "distancia" ? `Completar uma prova de ${nomeDist(m.dist_cat)}` : `Correr ${m.qtd} provas em ${m.ano}`;
}

// { pct (0-100), feita, texto, prazo } a partir das provas aprovadas e dos RPs
export function progressoMeta(m, provas, rps, hoje = new Date()) {
  let pct = 0, feita = false, texto = "";
  if (m.tipo === "tempo") {
    const marcas = [...provas, ...rps].filter(x => x.dist_cat === m.dist_cat).map(x => x.tempo_s);
    if (!marcas.length) texto = "Ainda sem tempo nessa distância";
    else { const b = Math.min(...marcas); feita = b <= m.tempo_s; pct = feita ? 100 : Math.min(99, Math.round(100 * m.tempo_s / b));
      texto = feita ? `Meta batida! Melhor: ${fmt(b)}` : `Faltam ${fmt(b - m.tempo_s)} (melhor: ${fmt(b)})`; }
  } else if (m.tipo === "distancia") {
    const p = provas.filter(x => x.dist_cat === m.dist_cat).sort((a, b) => (a.data_prova < b.data_prova ? -1 : 1))[0];
    feita = !!p; pct = feita ? 100 : 0; texto = feita ? `Concluída em ${dataBR(p.data_prova)}` : "Ainda sem prova nessa distância";
  } else {
    const n = provas.filter(x => String(x.data_prova).startsWith(String(m.ano))).length;
    feita = n >= m.qtd; pct = Math.min(100, Math.round(100 * n / m.qtd)); texto = `${n} de ${m.qtd} provas em ${m.ano}`;
  }
  let prazo = null;
  if (m.prazo && !feita) { const dias = Math.ceil((new Date(m.prazo + "T23:59:59") - hoje) / 864e5); prazo = dias < 0 ? "prazo vencido" : dias === 0 ? "termina hoje" : `${dias} dia${dias === 1 ? "" : "s"} restante${dias === 1 ? "" : "s"}`; }
  return { pct, feita, texto, prazo };
}

// ---------- telas ----------
export function rpsHTML(c, provas, rps, proprio) {
  const { esc } = c, lista = melhores(provas, rps), informados = rps.slice().sort((a, b) => (a.data_rp < b.data_rp ? 1 : -1));
  return `<h2>🏅 Recordes pessoais</h2><div class="card">${lista.map(x => `<div class="row"><div class="grow"><div class="name">${x.nome}</div>
    <div class="sub">${x.melhor ? `${x.melhor.origem === "prova" ? "✅ em prova" : "✍️ informado"} · ${dataBR(x.melhor.data)} · ${esc(x.melhor.detalhe)}` : "sem marca ainda"}${x.melhor && x.melhor.origem === "informado" && x.melhorProva ? `<br>melhor em prova: ${fmt(x.melhorProva.tempo_s)} · ${esc(x.melhorProva.detalhe)}` : ""}</div></div>
    <div class="val">${x.melhor ? fmt(x.melhor.tempo_s) : "—"}</div></div>`).join("")}
    <div class="sub" style="margin-top:6px">RP em prova vem do resultado aprovado. RP informado é de treino e não vale pontos no campeonato.</div></div>
  ${proprio ? `<button class="btn ghost" id="rpNovo" type="button">➕ Informar um RP de treino</button>
  <form id="rpForm" class="card" hidden style="margin-top:10px"><select name="dist" required>${DIST_FIXAS.map(d => `<option value="${d[0]}">${d[1]}</option>`).join("")}</select>
    <input name="tempo" placeholder="Tempo (h:mm:ss ou mm:ss)" required pattern="\\d{1,2}(:\\d{2}){1,2}" inputmode="numeric">
    <input name="data" type="date" required max="${new Date().toLocaleDateString("sv-SE")}"><input name="nota" maxlength="80" placeholder="Observação (opcional)">
    <div class="err" id="rpErr"></div><button class="btn">Salvar RP</button></form>
  ${informados.length ? `<div class="card" style="margin-top:10px"><div class="name">RPs informados</div>${informados.map(r => `<div class="row"><div class="grow"><div class="name">${nomeDist(r.dist_cat)} · ${fmt(r.tempo_s)}</div><div class="sub">${dataBR(r.data_rp)}${r.nota ? " · " + esc(r.nota) : ""}</div></div><button class="link inline" data-rpdel="${r.id}" aria-label="Apagar RP">✕</button></div>`).join("")}</div>` : ""}` : ""}`;
}

export function metasHTML(c, provas, rps, metas) {
  const { esc } = c;
  return `<h2>🎯 Minhas metas</h2>${metas.length ? metas.map(m => { const p = progressoMeta(m, provas, rps);
    return `<div class="card meta ${p.feita ? "feita" : ""}"><div class="provahead"><div class="name">${p.feita ? "✅ " : ""}${esc(textoMeta(m))}</div><button class="link inline" data-metadel="${m.id}" aria-label="Apagar meta">✕</button></div>
      <div class="barra"><i style="width:${p.pct}%"></i></div><div class="sub">${esc(p.texto)}${p.prazo ? " · " + p.prazo : ""}${m.prazo ? " · até " + dataBR(m.prazo) : ""}</div></div>`; }).join("")
    : `<div class="card empty">Defina uma meta de tempo, de distância ou de quantidade de provas e acompanhe aqui.</div>`}
  <button class="btn ghost" id="metaNova" type="button">➕ Nova meta</button>
  <form id="metaForm" class="card" hidden style="margin-top:10px">
    <select name="tipo" required><option value="tempo">⏱️ Baixar meu tempo numa distância</option><option value="distancia">📏 Correr uma distância nova</option><option value="provas">🏁 Número de provas no ano</option></select>
    <select name="dist">${DIST_FIXAS.map(d => `<option value="${d[0]}">${d[1]}</option>`).join("")}</select>
    <input name="tempo" placeholder="Tempo alvo (h:mm:ss ou mm:ss)" pattern="\\d{1,2}(:\\d{2}){1,2}" inputmode="numeric">
    <div class="grid2"><input name="qtd" type="number" min="1" max="100" placeholder="Quantas provas" hidden><input name="ano" type="number" min="2020" max="2100" value="${new Date().getFullYear()}" hidden></div>
    <label class="sub">Prazo (opcional)</label><input name="prazo" type="date" min="${new Date().toLocaleDateString("sv-SE")}">
    <div class="err" id="metaErr"></div><button class="btn">Salvar meta</button></form>`;
}

export function ligarRpsMetas(c, { recarregar, proprio = true }) {
  const { db, $, toast, parseTime } = c, me = c.me;
  if (!proprio) return;
  const alternar = (btn, form) => { const b = $(btn), f = $(form); if (b && f) b.onclick = () => { f.hidden = !f.hidden; if (!f.hidden) f.scrollIntoView({ behavior: "smooth", block: "center" }); }; };
  alternar("#rpNovo", "#rpForm"); alternar("#metaNova", "#metaForm");
  if ($("#rpForm")) $("#rpForm").onsubmit = async e => {
    e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)), t = parseTime(v.tempo);
    if (!t) return $("#rpErr").textContent = "Tempo inválido. Use h:mm:ss ou mm:ss.";
    const { error } = await db.from("rps").insert({ user_id: me.id, dist_cat: v.dist, tempo_s: t, data_rp: v.data, nota: v.nota.trim() || null });
    if (error) return $("#rpErr").textContent = error.message; toast("RP salvo 🏅"); recarregar();
  };
  const tipo = $("#metaForm")?.elements.tipo;
  if (tipo) {
    const ajustar = () => { const f = $("#metaForm").elements, t = tipo.value;
      f.dist.hidden = t === "provas"; f.tempo.hidden = t !== "tempo"; f.tempo.required = t === "tempo"; f.qtd.hidden = f.ano.hidden = t !== "provas"; f.qtd.required = f.ano.required = t === "provas"; };
    tipo.onchange = ajustar; ajustar();
    $("#metaForm").onsubmit = async e => {
      e.preventDefault(); const v = Object.fromEntries(new FormData(e.target)), t = v.tipo, reg = { user_id: me.id, tipo: t, prazo: v.prazo || null };
      if (t !== "provas") reg.dist_cat = v.dist;
      if (t === "tempo") { const s = parseTime(v.tempo); if (!s) return $("#metaErr").textContent = "Tempo inválido. Use h:mm:ss ou mm:ss."; reg.tempo_s = s; }
      if (t === "provas") { reg.qtd = +v.qtd; reg.ano = +v.ano; }
      const { error } = await db.from("metas").insert(reg);
      if (error) return $("#metaErr").textContent = error.message; toast("Meta criada 🎯"); recarregar();
    };
  }
  document.querySelectorAll("[data-rpdel]").forEach(b => b.onclick = async () => { await db.from("rps").delete().eq("id", b.dataset.rpdel); recarregar(); });
  document.querySelectorAll("[data-metadel]").forEach(b => b.onclick = async () => { await db.from("metas").delete().eq("id", b.dataset.metadel); recarregar(); });
}
