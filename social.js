// Etapa C: seguir corredores, avisos, equipes, temporada e hall da fama
export async function contarAvisos(c) {
  const { count } = await c.db.from("avisos").select("id", { count: "exact", head: true }).eq("user_id", c.me.id).eq("lido", false);
  return count || 0;
}

export async function avisosView(c, voltar) {
  const { db, app, esc, toast } = c;
  const { data, error } = await db.from("avisos").select("*").eq("user_id", c.me.id).order("criado_em", { ascending: false }).limit(50);
  const ico = { prova: "🏁", aprovada: "✅", rejeitada: "⚠️", seguidor: "👥" };
  app.innerHTML = `<button class="link" id="bk" style="text-align:left">← Voltar</button><h1>🔔 Avisos</h1>
    ${error ? `<div class="card empty">${esc(error.message)}</div>` : !(data || []).length ? `<div class="card empty">Nenhum aviso ainda.<br>Siga corredores para saber quando eles registrarem provas.</div>`
    : `<div class="card">${data.map(a => `<div class="row ${a.lido ? "" : "me"}" ${a.tipo === "prova" || a.tipo === "seguidor" ? `data-u="${a.ref_id}"` : ""}><div class="pos">${ico[a.tipo] || "🔔"}</div>
      <div class="grow"><div class="name" style="font-size:15px">${esc(a.texto)}</div><div class="sub">${new Date(a.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</div></div></div>`).join("")}</div>
      <button class="link" id="limpar">Apagar todos</button>`}`;
  $bk(app, voltar);
  if ((data || []).some(a => !a.lido)) db.from("avisos").update({ lido: true }).eq("user_id", c.me.id).eq("lido", false).then(() => {});
  const l = app.querySelector("#limpar"); if (l) l.onclick = async () => { await db.from("avisos").delete().eq("user_id", c.me.id); toast("Avisos apagados"); avisosView(c, voltar); };
  return app;
}
const $bk = (app, voltar) => { app.querySelector("#bk").onclick = voltar; };

// Botão seguir/deixar de seguir no perfil de outro corredor
export async function seguirHTML(c, uid) {
  if (uid === c.me.id) return "";
  const { data } = await c.db.from("seguidores").select("seguido").eq("seguidor", c.me.id).eq("seguido", uid).maybeSingle();
  return `<button class="btn ${data ? "ghost" : ""}" id="seguir" data-seg="${data ? 1 : 0}" style="margin-top:10px">${data ? "✓ Seguindo" : "➕ Seguir"}</button>`;
}
export function ligarSeguir(c, uid, recarregar) {
  const b = c.app.querySelector("#seguir"); if (!b) return;
  b.onclick = async () => {
    b.disabled = true;
    const r = b.dataset.seg === "1" ? await c.db.from("seguidores").delete().eq("seguidor", c.me.id).eq("seguido", uid) : await c.db.from("seguidores").insert({ seguidor: c.me.id, seguido: uid });
    if (r.error) { b.disabled = false; return c.toast(r.error.message); }
    recarregar();
  };
}

// Faixas do topo do ranking: temporada + patrocinadores
export function temporadaHTML(ano) {
  const fim = new Date(ano, 11, 31, 23, 59, 59), hoje = new Date();
  if (ano !== hoje.getFullYear()) return "";
  const dias = Math.ceil((fim - hoje) / 864e5);
  return `<div class="card center" style="padding:10px"><b>Temporada ${ano}</b> · ${dias <= 0 ? "último dia!" : `faltam <b>${dias}</b> dia(s) para fechar`}</div>`;
}
export function patrocinadoresHTML(c, lista) {
  if (!lista?.length) return "";
  return `<div class="card" style="padding:10px"><div class="sub" style="margin-bottom:6px">Patrocinadores</div><div class="grid2">${lista.map(p => `<a class="link" href="${c.esc(p.url)}" target="_blank" rel="noopener sponsored" style="display:block">${c.esc(p.nome)}</a>`).join("")}</div></div>`;
}

// Ranking de equipes + hall da fama
export async function equipesRankingHTML(c, ano) {
  const { data, error } = await c.db.rpc("ranking_equipes", { p_ano: ano });
  if (error) return `<div class="card empty">${c.esc(error.message)}</div>`;
  if (!data?.length) return `<div class="card empty">Nenhuma equipe pontuou em ${ano}.<br>Crie a sua em Perfil → Minha equipe.</div>`;
  return `<div class="card">${data.map((e, i) => `<div class="row"><div class="pos">${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</div><div class="grow"><div class="name">${c.esc(e.nome)}</div>
    <div class="sub">${c.esc(e.cidade || "")}${e.cidade ? " · " : ""}${e.membros} corredor(es)</div></div><div class="val">${c.fmtNum(e.pontos)}<div class="sub">pts</div></div></div>`).join("")}</div>`;
}
export async function hallHTML(c) {
  const { data } = await c.db.rpc("hall_da_fama");
  if (!data?.length) return "";
  const anos = [...new Set(data.map(x => x.ano))];
  return `<details class="card"><summary>🏛️ Hall da fama</summary>${anos.map(a => `<h2 style="font-size:18px">${a}</h2>${data.filter(x => x.ano === a).map(x =>
    `<div class="row link-row" data-u="${x.user_id}">${c.avatar(x)}<div class="grow"><div class="name">${c.esc(x.nome)}</div><div class="sub">Campeão ${x.sexo === "M" ? "masculino" : "feminino"}</div></div><div class="val">${c.fmtNum(x.pontos)}</div></div>`).join("")}`).join("")}</details>`;
}

// Perfil: minha equipe (entrar, criar, sair)
export async function equipeHTML(c) {
  const { data: todas } = await c.db.from("equipes").select("id,nome,cidade,dono").order("nome");
  const minha = (todas || []).find(e => e.id === c.me.equipe_id);
  return `<div class="card"><b>👟 Minha equipe</b>${minha ? `<div class="name" style="margin:6px 0">${c.esc(minha.nome)}</div><div class="grid2"><button class="btn ghost" id="eqSair">Sair da equipe</button>${minha.dono === c.me.id ? `<button class="btn ghost" id="eqDel" style="color:#ff6b6b">Excluir equipe</button>` : "<span></span>"}</div>`
    : `<select id="eqSel"><option value="">Escolha uma equipe…</option>${(todas || []).map(e => `<option value="${e.id}">${c.esc(e.nome)}</option>`).join("")}</select>
      <div class="grid2"><button class="btn" id="eqEntrar">Entrar</button><button class="btn ghost" id="eqNova">Criar equipe</button></div>`}</div>`;
}
export function ligarEquipe(c, recarregar) {
  const { db, me, toast, app } = c, set = async id => {
    const { error } = await db.from("profiles").update({ equipe_id: id }).eq("id", me.id);
    if (error) return toast(error.message); me.equipe_id = id; recarregar();
  };
  const g = id => app.querySelector(id);
  if (g("#eqSair")) g("#eqSair").onclick = () => set(null);
  if (g("#eqDel")) g("#eqDel").onclick = async () => {
    if (!await c.confirmarModal({ titulo: "Excluir equipe?", texto: "Todos os membros ficam sem equipe.", rotulo: "Excluir", perigo: true })) return;
    const { error } = await db.from("equipes").delete().eq("id", me.equipe_id); if (error) return toast(error.message); me.equipe_id = null; recarregar();
  };
  if (g("#eqEntrar")) g("#eqEntrar").onclick = () => { const v = g("#eqSel").value; if (!v) return toast("Escolha uma equipe"); set(v); };
  if (g("#eqNova")) g("#eqNova").onclick = async () => {
    const nome = await c.pedirTexto({ titulo: "Nova equipe", dica: "Nome da equipe (3 a 40 letras).", rotulo: "Criar", minimo: 3, maximo: 40 });
    if (!nome) return;
    const { data, error } = await db.from("equipes").insert({ nome: nome.trim(), cidade: me.cidade, dono: me.id }).select().single();
    if (error) return toast(error.code === "23505" ? "Já existe uma equipe com esse nome" : error.message);
    set(data.id);
  };
}
