// Painel de administração: provas pendentes, denúncias, provas, usuários e registro de ações.
const ABAS = [["pendentes", "⏳ Pendentes"], ["denuncias", "🚩 Denúncias"], ["provas", "🏁 Provas"], ["usuarios", "👥 Usuários"], ["registro", "📜 Registro"], ["erros", "🐞 Erros"]];
const estado = { aba: "pendentes", busca: "" };

export async function adminView(c, voltar) {
  const { app, $ } = c;
  app.innerHTML = `<button class="link" id="bk" style="text-align:left">← Voltar</button><h1>🛡️ Administração</h1>
    <div class="chips">${ABAS.map(a => `<button class="chip ${estado.aba === a[0] ? "on" : ""}" data-aba="${a[0]}">${a[1]}</button>`).join("")}</div><div id="adBox">Carregando…</div>`;
  $("#bk").onclick = voltar;
  app.querySelectorAll("[data-aba]").forEach(b => b.onclick = () => { estado.aba = b.dataset.aba; adminView(c, voltar); });
  const recarregar = () => adminView(c, voltar);
  await ({ pendentes, denuncias, provas, usuarios, registro, erros }[estado.aba])(c, $("#adBox"), recarregar);
}

const log = (c, acao, alvo_tipo, alvo_id, detalhe) => c.db.from("auditoria").insert({ admin_id: c.me.id, acao, alvo_tipo, alvo_id: String(alvo_id), detalhe: detalhe ?? null });

async function pendentes(c, box, recarregar) {
  const { db, esc, toast, provaCard, bindPrints, pedirTexto } = c;
  const { data } = await db.from("provas").select("*, profiles(nome, cidade, sexo)").eq("status", "pendente").order("created_at");
  box.innerHTML = (data || []).map(r => provaCard(r, r.profiles ? `${esc(r.profiles.nome)} (${esc(r.profiles.cidade)}, ${esc(r.profiles.sexo)}) · ` : "",
    `${r.peito ? `<div class="sub">Nº de peito: <b>${esc(r.peito)}</b></div>` : ""}<button class="link inline" data-print="${esc(r.print_path)}">ver print</button>${r.fonte_url ? ` · <a class="link inline" href="${esc(r.fonte_url)}" target="_blank" rel="noopener">🔎 ver fonte</a>` : ""}
    <div class="grid2" style="margin-top:8px"><button class="btn" data-ok="${r.id}">Aprovar</button><button class="btn ghost" data-no="${r.id}">Rejeitar</button></div>`)).join("")
    || `<div class="card empty">Nada pendente 🎉</div>`;
  bindPrints();
  box.querySelectorAll("[data-ok]").forEach(b => b.onclick = async () => {
    const r = await db.from("provas").update({ status: "aprovada", motivo: null }).eq("id", b.dataset.ok); if (r.error) return toast(r.error.message);
    await log(c, "aprovar prova", "prova", b.dataset.ok); recarregar(); });
  box.querySelectorAll("[data-no]").forEach(b => b.onclick = async () => {
    const motivo = await pedirTexto({ titulo: "Motivo da rejeição", dica: "O corredor vai ver este texto.", rotulo: "Rejeitar", minimo: 5 }); if (!motivo) return;
    const r = await db.from("provas").update({ status: "rejeitada", motivo }).eq("id", b.dataset.no); if (r.error) return toast(r.error.message);
    await log(c, "rejeitar prova", "prova", b.dataset.no, motivo); recarregar(); });
}

async function denuncias(c, box, recarregar) {
  const { db, esc, toast, fmtDate, pedirTexto, confirmarModal } = c;
  const { data } = await db.from("denuncias").select("*, profiles!denuncias_denunciante_fkey(nome)").order("status").order("criada_em", { ascending: false }).limit(60);
  const lista = data || [];
  const ids = t => [...new Set(lista.filter(d => d.alvo_tipo === t).map(d => d.alvo_id))];
  const [provas, eventos, perfis] = await Promise.all([
    ids("prova").length ? db.from("provas").select("id, user_id, nome_prova, data_prova, tempo_s, peito, fonte_url, status, profiles(nome)").in("id", ids("prova")) : { data: [] },
    ids("evento").length ? db.from("eventos").select("id, user_id, nome, data_evento, cidade, profiles!eventos_user_id_fkey(nome)").in("id", ids("evento")) : { data: [] },
    ids("perfil").length ? db.from("profiles").select("id, nome, cidade, suspenso").in("id", ids("perfil")) : { data: [] }]);
  const mapa = t => Object.fromEntries(((t === "prova" ? provas : t === "evento" ? eventos : perfis).data || []).map(x => [x.id, x]));
  const M = { prova: mapa("prova"), evento: mapa("evento"), perfil: mapa("perfil") };
  const resumo = d => { const a = M[d.alvo_tipo][d.alvo_id];
    if (!a) return "<i>(item já removido)</i>";
    return d.alvo_tipo === "prova" ? `🏁 <b>${esc(a.nome_prova)}</b> de ${esc(a.profiles?.nome)} · ${fmtDate(a.data_prova)}${a.peito ? " · peito " + esc(a.peito) : ""}${a.fonte_url ? ` · <a class="link inline" href="${esc(a.fonte_url)}" target="_blank" rel="noopener">fonte</a>` : ""}`
      : d.alvo_tipo === "evento" ? `📅 <b>${esc(a.nome)}</b> (${esc(a.cidade)}) anunciada por ${esc(a.profiles?.nome)}` : `👤 <b>${esc(a.nome)}</b> (${esc(a.cidade)})${a.suspenso ? " · suspenso" : ""}`; };
  box.innerHTML = lista.map(d => `<div class="card"><div class="sub">${esc(d.profiles?.nome ?? "—")} denunciou em ${fmtDate(d.criada_em.slice(0, 10))} · <span class="tag ${d.status === "aberta" ? "pendente" : d.status === "resolvida" ? "aprovada" : ""}">${d.status}</span></div>
    <div style="margin:6px 0">${resumo(d)}</div><div class="sub" style="color:var(--text)">“${esc(d.motivo)}”</div>
    ${d.status === "aberta" ? `<div class="grid2" style="margin-top:8px"><button class="btn ghost" data-dz="${d.id}">Descartar</button><button class="btn ghost" data-rs="${d.id}">Resolvida</button>
      ${M[d.alvo_tipo][d.alvo_id] && d.alvo_tipo !== "perfil" ? `<button class="btn" style="background:var(--bad);color:#fff" data-rm="${d.id}">Remover item</button>` : ""}
      ${M[d.alvo_tipo][d.alvo_id] ? `<button class="btn" style="background:var(--bad);color:#fff" data-su="${d.id}">Suspender autor</button>` : ""}</div>` : ""}</div>`).join("") || `<div class="card empty">Nenhuma denúncia 🎉</div>`;
  const por = id => lista.find(x => x.id === id);
  const autorDe = d => { const a = M[d.alvo_tipo][d.alvo_id]; return d.alvo_tipo === "perfil" ? a?.id : a?.user_id; };
  const fechar = async (d, status, acao, det) => { const r = await db.from("denuncias").update({ status }).eq("id", d.id); if (r.error) return toast(r.error.message); await log(c, acao, "denuncia", d.id, det); recarregar(); };
  box.querySelectorAll("[data-dz]").forEach(b => b.onclick = () => fechar(por(b.dataset.dz), "descartada", "descartar denúncia"));
  box.querySelectorAll("[data-rs]").forEach(b => b.onclick = () => fechar(por(b.dataset.rs), "resolvida", "resolver denúncia"));
  box.querySelectorAll("[data-rm]").forEach(b => b.onclick = async () => {
    const d = por(b.dataset.rm); if (!await confirmarModal({ titulo: "Remover o item denunciado?", texto: "Isso apaga o item para todos.", rotulo: "Remover", perigo: true })) return;
    const r = await db.from(d.alvo_tipo === "prova" ? "provas" : "eventos").delete().eq("id", d.alvo_id); if (r.error) return toast(r.error.message);
    await log(c, "remover " + d.alvo_tipo, d.alvo_tipo, d.alvo_id, d.motivo); fechar(d, "resolvida", "resolver denúncia", "item removido"); });
  box.querySelectorAll("[data-su]").forEach(b => b.onclick = async () => {
    const d = por(b.dataset.su), autor = autorDe(d), motivo = await pedirTexto({ titulo: "Suspender o autor", dica: "Ele não aparece mais nos rankings e não pode publicar.", rotulo: "Suspender", minimo: 5 }); if (!motivo) return;
    const r = await db.from("profiles").update({ suspenso: true, suspenso_motivo: motivo }).eq("id", autor); if (r.error) return toast(r.error.message);
    await log(c, "suspender usuário", "perfil", autor, motivo); fechar(d, "resolvida", "resolver denúncia", "autor suspenso"); });
}

async function provas(c, box, recarregar) {
  const { db, esc, toast, fmtDate, fmtTime, pedirTexto, confirmarModal } = c;
  box.innerHTML = `<input id="adBusca" placeholder="Buscar por corredor ou prova" value="${esc(estado.busca)}"><div id="adLista">Carregando…</div>`;
  const carregar = async () => {
    const { data } = await db.from("provas").select("id, nome_prova, data_prova, tempo_s, status, verificada, peito, user_id, profiles(nome)").order("created_at", { ascending: false }).limit(80);
    const q = estado.busca.toLowerCase(), l = (data || []).filter(p => !q || (p.nome_prova + " " + (p.profiles?.nome ?? "")).toLowerCase().includes(q));
    box.querySelector("#adLista").innerHTML = l.map(p => `<div class="row"><div class="grow"><div class="name">${esc(p.nome_prova)}</div><div class="sub">${esc(p.profiles?.nome)} · ${fmtDate(p.data_prova)} · ${fmtTime(p.tempo_s)}${p.peito ? " · nº " + esc(p.peito) : ""} · <span class="tag ${p.status === "aprovada" ? "aprovada" : p.status === "rejeitada" ? "rejeitada" : "pendente"}">${p.status}</span>${p.verificada ? " ✅" : ""}</div></div>
      <div style="text-align:right">${p.status !== "rejeitada" ? `<button class="link inline" data-rv="${p.id}">revogar</button><br>` : ""}<button class="link inline" data-ex="${p.id}" style="color:var(--bad)">excluir</button></div></div>`).join("") || `<div class="card empty">Nada encontrado</div>`;
    box.querySelectorAll("[data-rv]").forEach(b => b.onclick = async () => {
      const motivo = await pedirTexto({ titulo: "Revogar prova", dica: "Ela sai do ranking e o corredor vê o motivo.", rotulo: "Revogar", minimo: 5 }); if (!motivo) return;
      const r = await db.from("provas").update({ status: "rejeitada", motivo }).eq("id", b.dataset.rv); if (r.error) return toast(r.error.message); await log(c, "revogar prova", "prova", b.dataset.rv, motivo); carregar(); });
    box.querySelectorAll("[data-ex]").forEach(b => b.onclick = async () => {
      if (!await confirmarModal({ titulo: "Excluir esta prova?", texto: "Não dá para desfazer.", rotulo: "Excluir", perigo: true })) return;
      const r = await db.from("provas").delete().eq("id", b.dataset.ex); if (r.error) return toast(r.error.message); await log(c, "excluir prova", "prova", b.dataset.ex); carregar(); });
  };
  box.querySelector("#adBusca").oninput = e => { estado.busca = e.target.value; carregar(); };
  carregar();
}

async function usuarios(c, box, recarregar) {
  const { db, esc, toast, fmtDate, avatar, pedirTexto } = c;
  const [{ data: ps }, { data: pv }] = await Promise.all([db.from("profiles").select("id, nome, cidade, sexo, avatar_url, suspenso, suspenso_motivo, created_at").order("created_at", { ascending: false }).limit(100), db.from("provas").select("user_id")]);
  const n = {}; (pv || []).forEach(p => n[p.user_id] = (n[p.user_id] || 0) + 1);
  box.innerHTML = `<p class="sub">${(ps || []).length} usuário(s) · ${(ps || []).filter(p => p.suspenso).length} suspenso(s)</p>` + (ps || []).map(p => `<div class="row">${avatar(p)}<div class="grow"><div class="name">${esc(p.nome)}${p.suspenso ? ` <span class="tag rejeitada">suspenso</span>` : ""}</div>
    <div class="sub">${esc(p.cidade)} · ${p.sexo} · ${n[p.id] || 0} prova(s) · desde ${fmtDate(p.created_at.slice(0, 10))}${p.suspenso && p.suspenso_motivo ? ` · “${esc(p.suspenso_motivo)}”` : ""}</div></div>
    ${p.id === c.me.id ? "" : `<button class="link inline" data-sp="${p.id}" data-s="${p.suspenso ? 0 : 1}" ${p.suspenso ? "" : 'style="color:var(--bad)"'}>${p.suspenso ? "reativar" : "suspender"}</button>`}</div>`).join("");
  box.querySelectorAll("[data-sp]").forEach(b => b.onclick = async () => {
    const sus = b.dataset.s === "1"; let motivo = null;
    if (sus) { motivo = await pedirTexto({ titulo: "Suspender usuário", dica: "Ele some dos rankings e não pode publicar.", rotulo: "Suspender", minimo: 5 }); if (!motivo) return; }
    const r = await db.from("profiles").update({ suspenso: sus, suspenso_motivo: motivo }).eq("id", b.dataset.sp); if (r.error) return toast(r.error.message);
    await log(c, sus ? "suspender usuário" : "reativar usuário", "perfil", b.dataset.sp, motivo); recarregar(); });
}

async function registro(c, box) {
  const { db, esc } = c;
  const { data } = await db.from("auditoria").select("*, profiles!auditoria_admin_id_fkey(nome)").order("criada_em", { ascending: false }).limit(60);
  box.innerHTML = (data || []).map(a => `<div class="row"><div class="grow"><div class="name">${esc(a.acao)}</div><div class="sub">${esc(a.profiles?.nome ?? "—")} · ${new Date(a.criada_em).toLocaleString("pt-BR")}${a.detalhe ? " · " + esc(a.detalhe) : ""}</div></div></div>`).join("") || `<div class="card empty">Nenhuma ação registrada ainda.</div>`;
}

async function erros(c, box, recarregar) {
  const { db, esc, toast } = c;
  const { data, error } = await db.from("erros_app").select("*").order("criado_em", { ascending: false }).limit(60);
  if (error) { box.innerHTML = `<div class="card empty">${esc(error.message)}</div>`; return; }
  box.innerHTML = !(data || []).length ? `<div class="card empty">Nenhum erro registrado 🎉</div>`
    : (data.map(e => `<div class="row"><div class="grow"><div class="name" style="font-size:14px">${esc(e.mensagem)}</div><div class="sub">${esc(e.origem || "")} · ${new Date(e.criado_em).toLocaleString("pt-BR")}</div></div></div>`).join("") + `<button class="link" id="erLimpar">Limpar lista</button>`);
  const b = box.querySelector("#erLimpar"); if (b) b.onclick = async () => { await db.from("erros_app").delete().gte("id", 0); toast("Lista limpa"); recarregar(); };
}
