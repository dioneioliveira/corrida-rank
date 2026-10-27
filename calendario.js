// Calendário de provas anunciadas pelos corredores: "Vamos nesta?"
const DISTS = [["3k", "3K"], ["5k", "5K"], ["10k", "10K"], ["15k", "15K"], ["21k", "21K"], ["42k", "42K"], ["outra", "Outra"]];
const filtro = { cidade: "", soEu: false };
const hojeISO = () => new Date().toLocaleDateString("sv-SE");

const dataLonga = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).replace(".", "");
const mesAno = d => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

// Arquivo .ics (abre direto no calendário do celular)
export function icsEvento(ev) {
  const t = s => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const ymd = d => d.replace(/-/g, ""), prox = new Date(new Date(ev.data_evento + "T12:00:00").getTime() + 864e5).toLocaleDateString("sv-SE");
  const desc = [ev.distancias?.length ? "Distâncias: " + ev.distancias.map(x => x.toUpperCase()).join(", ") : "", ev.link || "", ev.obs || ""].filter(Boolean).join("\n");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Corrida Rank//PT-BR", "BEGIN:VEVENT", `UID:${ev.id}@corridarank`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, "")}`, `DTSTART;VALUE=DATE:${ymd(ev.data_evento)}`, `DTEND;VALUE=DATE:${ymd(prox)}`,
    `SUMMARY:${t(ev.nome)}`, `LOCATION:${t(ev.cidade)}`, `DESCRIPTION:${t(desc)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

export async function calendarioView(c, box) {
  const { db, esc, toast, avatar, fmtDate } = c, me = c.me;
  box.innerHTML = "Carregando…";
  const { data, error } = await db.from("eventos")
    .select("*, profiles!eventos_user_id_fkey(nome, cidade, avatar_url), evento_presencas(user_id, status, profiles!evento_presencas_user_id_fkey(nome, avatar_url))")   // caminhos indicados: há mais de uma ligação entre eventos e perfis
    .gte("data_evento", hojeISO()).order("data_evento", { ascending: true });
  if (error) { box.innerHTML = `<div class="card empty">${esc(error.message)}</div>`; return; }
  const todos = (data || []).slice().sort((a, b) => a.data_evento.localeCompare(b.data_evento)), cidades = [...new Set(todos.map(e => e.cidade))].sort();
  const lista = todos.filter(e => (!filtro.cidade || e.cidade === filtro.cidade) && (!filtro.soEu || e.evento_presencas?.some(p => p.user_id === me.id)));

  let mes = "";
  const cartao = e => {
    const pres = e.evento_presencas || [], vou = pres.filter(p => p.status === "vou"), talvez = pres.filter(p => p.status === "talvez"), minha = pres.find(p => p.user_id === me.id)?.status;
    const dono = e.user_id === me.id;
    return `<div class="card evento"><div class="provahead"><div style="min-width:0"><div class="name">${esc(e.nome)}</div>
      <div class="sub">📅 ${dataLonga(e.data_evento)} · 📍 ${esc(e.cidade)}</div></div><div class="datacal"><b>${e.data_evento.slice(8, 10)}</b><span>${new Date(e.data_evento + "T12:00:00").toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span></div></div>
      ${e.distancias?.length ? `<div class="dists">${e.distancias.map(d => `<span class="bib">${d === "outra" ? "OUTRA" : d.toUpperCase()}</span>`).join("")}</div>` : ""}
      ${e.obs ? `<div class="sub" style="margin:6px 0">${esc(e.obs)}</div>` : ""}
      <div class="quem"><div class="faces">${vou.slice(0, 6).map(p => avatar({ nome: p.profiles?.nome, avatar_url: p.profiles?.avatar_url })).join("")}</div>
        <div class="sub"><b>${vou.length}</b> ${vou.length === 1 ? "vai" : "vão"} · ${talvez.length} talvez</div></div>
      <div class="grid2" style="margin:8px 0"><button class="btn ${minha === "vou" ? "" : "ghost"}" data-pres="vou" data-ev="${e.id}">${minha === "vou" ? "✅ Eu vou!" : "Vamos nesta!"}</button>
        <button class="btn ghost ${minha === "talvez" ? "on" : ""}" data-pres="talvez" data-ev="${e.id}">${minha === "talvez" ? "🤔 Talvez ✓" : "🤔 Talvez"}</button></div>
      <div class="sub">${e.link ? `<a class="link inline" href="${esc(e.link)}" target="_blank" rel="noopener">🔗 site e inscrição</a> · ` : ""}<button class="link inline" data-cal="${e.id}">📆 agenda</button> · <button class="link inline" data-chamar="${e.id}">📣 chamar a galera</button>${dono || c.isAdmin ? ` · <button class="link inline" data-evdel="${e.id}">excluir</button>` : ""}</div>
      <div class="sub" style="margin-top:4px">Anunciada por ${esc(e.profiles?.nome ?? "—")}</div></div>`;
  };
  const chip = (on, t, a) => `<button class="chip ${on ? "on" : ""}" ${a}>${t}</button>`;
  box.innerHTML = `<button class="btn" id="evNovo" type="button">📅 Anunciar uma prova</button>
    <form id="evForm" class="card" hidden style="margin:10px 0"><input name="nome" placeholder="Nome da prova" required minlength="3" maxlength="120">
      <div class="grid2"><input name="data" type="date" required min="${hojeISO()}"><input name="cidade" placeholder="Cidade" required maxlength="60" value="${esc(me.cidade)}"></div>
      <div class="sub">Distâncias</div><div class="chips">${DISTS.map(d => `<label class="chip"><input type="checkbox" name="d_${d[0]}" hidden>${d[1]}</label>`).join("")}</div>
      <input name="link" type="url" placeholder="Link do site/inscrição (https://...)" maxlength="500"><input name="obs" placeholder="Observação (opcional)" maxlength="300">
      <div class="err" id="evErr"></div><button class="btn">Publicar no calendário</button></form>
    <div class="chips" style="margin-top:10px">${chip(!filtro.cidade && !filtro.soEu, "Todas", 'data-f="todas"')}${chip(filtro.soEu, "⭐ As que eu vou", 'data-f="eu"')}${me.cidade ? chip(filtro.cidade === me.cidade, "📍 " + esc(me.cidade), `data-f="cid" data-v="${esc(me.cidade)}"`) : ""}
      ${cidades.filter(x => x !== me.cidade).map(x => chip(filtro.cidade === x, esc(x), `data-f="cid" data-v="${esc(x)}"`)).join("")}</div>
    ${lista.length ? lista.map(e => { const m = mesAno(e.data_evento), cab = m !== mes ? `<h2>${m}</h2>` : ""; mes = m; return cab + cartao(e); }).join("")
      : `<div class="card empty">Nenhuma prova anunciada ${filtro.cidade || filtro.soEu ? "com esse filtro" : "ainda"}.<br>Conhece uma? Anuncie e chame a galera! 🏃</div>`}`;

  const recarregar = () => calendarioView(c, box);
  box.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { const f = b.dataset.f; filtro.cidade = f === "cid" && filtro.cidade !== b.dataset.v ? b.dataset.v : ""; filtro.soEu = f === "eu" ? !filtro.soEu : false; recarregar(); });
  $form(box, recarregar, c);
  box.querySelectorAll("[data-pres]").forEach(b => b.onclick = async () => {
    const ev = todos.find(x => x.id === b.dataset.ev), atual = ev.evento_presencas?.find(p => p.user_id === me.id)?.status, novo = b.dataset.pres;
    const r = atual === novo ? await db.from("evento_presencas").delete().eq("evento_id", ev.id).eq("user_id", me.id)
      : await db.from("evento_presencas").upsert({ evento_id: ev.id, user_id: me.id, status: novo }, { onConflict: "evento_id,user_id" });
    if (r.error) return toast(r.error.message); if (novo === "vou" && atual !== "vou") toast("Boa! Você está na lista 🏃"); recarregar();
  });
  box.querySelectorAll("[data-evdel]").forEach(b => b.onclick = async () => { if (!confirm("Excluir este anúncio?")) return; await db.from("eventos").delete().eq("id", b.dataset.evdel); recarregar(); });
  box.querySelectorAll("[data-cal]").forEach(b => b.onclick = () => {
    const ev = todos.find(x => x.id === b.dataset.cal), url = URL.createObjectURL(new Blob([icsEvento(ev)], { type: "text/calendar" }));
    const a = document.createElement("a"); a.href = url; a.download = "prova.ics"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  });
  box.querySelectorAll("[data-chamar]").forEach(b => b.onclick = async () => {
    const ev = todos.find(x => x.id === b.dataset.chamar), texto = `Vamos nesta? ${ev.nome} — ${dataLonga(ev.data_evento)}, ${ev.cidade}. Marque presença no Corrida Rank:`;
    if (navigator.share) { try { await navigator.share({ title: ev.nome, text: texto, url: c.linkApp }); return; } catch (e) { if (e.name === "AbortError") return; } }
    try { await navigator.clipboard.writeText(texto + " " + c.linkApp); toast("Convite copiado ✅"); } catch { toast(texto); }
  });
}

function $form(box, recarregar, c) {
  const { db, toast } = c, me = c.me, q = s => box.querySelector(s);
  q("#evNovo").onclick = () => { const f = q("#evForm"); f.hidden = !f.hidden; if (!f.hidden) f.scrollIntoView({ behavior: "smooth", block: "center" }); };
  box.querySelectorAll("label.chip input").forEach(i => i.onchange = () => i.parentElement.classList.toggle("on", i.checked));
  q("#evForm").onsubmit = async e => {
    e.preventDefault(); const f = e.target.elements, dists = DISTS.map(d => d[0]).filter(d => f["d_" + d]?.checked);
    const { error } = await db.from("eventos").insert({ user_id: me.id, nome: f.nome.value.trim(), data_evento: f.data.value, cidade: f.cidade.value.trim(), distancias: dists, link: f.link.value.trim() || null, obs: f.obs.value.trim() || null });
    if (error) return q("#evErr").textContent = error.message; toast("Prova anunciada! 📅"); recarregar();
  };
}
