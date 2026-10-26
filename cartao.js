// Gera o cartão de resultado (formato Stories 1080×1920) direto no aparelho, com canvas.
import { fmtNum, fmtKm, nivelDe, proximoNivel } from "./regras.js";
const W = 1080, H = 1920, VOLT = "#d4ff1e", HOT = "#ff4d1f", INK = "#0c0e11";
const DISP = '"Barlow Condensed","Arial Narrow",Impact,sans-serif', BODY = '"Barlow",system-ui,sans-serif';

const fmtTime = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = Math.round(s % 60);
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

function checker(ctx, x, y, w, h, size = 28) {
  for (let i = 0; i < Math.ceil(w / size); i++) for (let j = 0; j < Math.ceil(h / size); j++) {
    ctx.fillStyle = (i + j) % 2 ? INK : "#f3f5f7"; ctx.fillRect(x + i * size, y + j * size, Math.min(size, w - i * size), Math.min(size, h - j * size)); }
}
function wrap(ctx, text, maxW, maxLines) {
  const words = text.split(" "), lines = []; let cur = "";
  for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…"; }
  return lines;
}
function loadImg(url) {
  return new Promise(res => { if (!url) return res(null); const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
}
function box(ctx, x, y, w, h, big, small) {
  ctx.fillStyle = "#161a20"; ctx.strokeStyle = "#2a313c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.fill(); ctx.stroke();
  ctx.textAlign = "center"; ctx.fillStyle = "#f3f5f7"; ctx.font = `italic 800 92px ${DISP}`; ctx.fillText(big, x + w / 2, y + 100);
  ctx.fillStyle = "#8d97a8"; ctx.font = `600 30px ${BODY}`; ctx.fillText(small.toUpperCase(), x + w / 2, y + 150);
}

function fundo(ctx) {
  ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W / 2, 0, 50, W / 2, 0, 1100); g.addColorStop(0, "#26340a"); g.addColorStop(1, "rgba(12,14,17,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,.04)"; ctx.lineWidth = 6; for (let x = -H; x < W; x += 140) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H * .6, 0); ctx.stroke(); }
  checker(ctx, 0, 0, W, 28); checker(ctx, 0, H - 28, W, 28);

}
function logo(ctx) {
  ctx.textAlign = "left"; ctx.fillStyle = "#f3f5f7"; ctx.font = `italic 800 70px ${DISP}`; ctx.fillText("CORRIDA", 70, 140);
  const cw = ctx.measureText("CORRIDA ").width; ctx.fillStyle = VOLT; ctx.fillText("RANK", 70 + cw, 140);
}
async function fontes() { try { await Promise.all([document.fonts.load(`italic 800 100px ${DISP}`), document.fonts.load(`600 30px ${BODY}`)]); } catch { /* usa fonte reserva */ } }
function avatarCirc(ctx, img, nome, cx, cy, r, borda) {
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  if (img) { const m = Math.min(img.width, img.height); ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, cx - r, cy - r, r * 2, r * 2); }
  else { ctx.fillStyle = "#1d222a"; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); ctx.fillStyle = "#f3f5f7"; ctx.textAlign = "center"; ctx.font = `italic 800 ${r * 1.3}px ${DISP}`; ctx.fillText((nome || "?")[0].toUpperCase(), cx, cy + r * .45); }
  ctx.restore(); ctx.strokeStyle = borda; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
}

// r: linha de provas (com pts opcionais). p: { nome, cidade, avatar_url }
export async function cartaoProva(r, p) {
  try { await Promise.all([document.fonts.load(`italic 800 100px ${DISP}`), document.fonts.load(`600 30px ${BODY}`)]); } catch { /* usa fonte reserva */ }
  const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d");
  fundo(ctx);
  ctx.textAlign = "left";
  ctx.fillStyle = "#f3f5f7"; ctx.font = `italic 800 70px ${DISP}`; ctx.fillText("CORRIDA", 70, 140);
  const cw = ctx.measureText("CORRIDA ").width; ctx.fillStyle = VOLT; ctx.fillText("RANK", 70 + cw, 140);

  // corredor
  const img = await loadImg(p.avatar_url);
  ctx.save(); ctx.beginPath(); ctx.arc(150, 290, 70, 0, Math.PI * 2); ctx.clip();
  if (img) { const s = Math.min(img.width, img.height); ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 80, 220, 140, 140); }
  else { ctx.fillStyle = "#1d222a"; ctx.fillRect(80, 220, 140, 140); ctx.fillStyle = "#f3f5f7"; ctx.textAlign = "center"; ctx.font = `italic 800 90px ${DISP}`; ctx.fillText((p.nome || "?")[0].toUpperCase(), 150, 320); ctx.textAlign = "left"; }
  ctx.restore(); ctx.strokeStyle = VOLT; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(150, 290, 70, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "#f3f5f7"; ctx.font = `italic 800 76px ${DISP}`; ctx.fillText((p.nome || "").toUpperCase(), 250, 288);
  ctx.fillStyle = "#8d97a8"; ctx.font = `600 38px ${BODY}`; ctx.fillText("📍 " + (p.cidade || ""), 250, 342);

  // nome da prova
  ctx.fillStyle = "#f3f5f7"; ctx.font = `italic 800 112px ${DISP}`;
  const lines = wrap(ctx, r.nome_prova.toUpperCase(), W - 140, 2); lines.forEach((l, i) => ctx.fillText(l, 70, 530 + i * 112));
  const y2 = 530 + lines.length * 112 - 20;
  ctx.fillStyle = "#8d97a8"; ctx.font = `600 40px ${BODY}`;
  ctx.fillText(new Date(r.data_prova + "T12:00:00").toLocaleDateString("pt-BR") + (r.cidade_prova ? " · " + r.cidade_prova : ""), 70, y2 + 20);

  // peitoral
  const bx = 220, by = 740, bw = 640, bh = 380, lab = r.dist_cat === "outra" ? fmtKm(r.distancia_km) + "K" : r.dist_cat.toUpperCase();
  ctx.save(); ctx.translate(W / 2, by + bh / 2); ctx.rotate(-0.04); ctx.translate(-W / 2, -(by + bh / 2));
  ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(bx + 14, by + 18, bw, bh);
  ctx.fillStyle = "#f6f7f2"; ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = INK; [[bx + 36, by + 36], [bx + bw - 36, by + 36], [bx + 36, by + bh - 76], [bx + bw - 36, by + bh - 76]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 11, 0, 7); ctx.fill(); });
  ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.font = `italic 800 330px ${DISP}`; ctx.fillText(lab, W / 2, by + 285);
  ctx.fillStyle = HOT; ctx.fillRect(bx, by + bh - 52, bw, 52); checker(ctx, bx, by + bh - 52, bw, 20, 20); ctx.restore();

  // tempo
  ctx.textAlign = "center"; ctx.fillStyle = VOLT; ctx.font = `italic 800 330px ${DISP}`; ctx.fillText(fmtTime(r.tempo_s), W / 2, 1450);
  ctx.fillStyle = "#8d97a8"; ctx.font = `600 38px ${BODY}`; ctx.fillText("TEMPO OFICIAL", W / 2, 1515);

  // números
  const items = [[fmtTime(r.tempo_s / r.distancia_km), "min/km"], [`${r.pos_geral}º`, `de ${r.inscritos} no geral`]];
  if (r.pos_cat) items.push([`${r.pos_cat}º`, `${r.categoria || "categoria"} · ${r.insc_cat}`]);
  const gap = 24, bwid = (W - 140 - gap * (items.length - 1)) / items.length;
  items.forEach((it, i) => box(ctx, 70 + i * (bwid + gap), 1580, bwid, 190, it[0], it[1]));

  if (r.pts_geral != null) {
    ctx.fillStyle = VOLT; ctx.beginPath(); ctx.roundRect(70, 1800, W - 140, 66, 12); ctx.fill();
    ctx.fillStyle = INK; ctx.font = `italic 800 52px ${DISP}`; ctx.fillText(`+${fmtNum(r.pts_geral)} PTS NO CAMPEONATO · AQUI SÓ VALE PROVA`, W / 2, 1851);
  }
  return await new Promise(res => c.toBlob(res, "image/png"));
}

// Abre a folha de compartilhamento do celular; no computador, baixa a imagem.
async function entregar(blob, texto) {
  const file = new File([blob], "corrida-rank.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text: texto }); return "compartilhado"; } catch (e) { if (e.name === "AbortError") return "cancelado"; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "corrida-rank.png"; a.click(); URL.revokeObjectURL(a.href);
  return "baixado";
}
export async function compartilharProva(r, p) {
  return entregar(await cartaoProva(r, p), `${r.nome_prova}: ${fmtTime(r.tempo_s)} — ${r.pos_geral}º de ${r.inscritos}. #CorridaRank`);
}

// Cartão do ranking. o: { titulo, filtros, tempos, rows, meIdx } — rows já ordenadas; meIdx = posição (0-based) do corredor.
export async function cartaoRanking(o) {
  await fontes();
  const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d");
  fundo(ctx); logo(ctx);
  const valor = r => o.tempos ? fmtTime(r.tempo_s) : fmtNum(r.pontos) + " pts";
  const me = o.rows[o.meIdx], pos = o.meIdx + 1;

  ctx.textAlign = "left"; ctx.fillStyle = "#f3f5f7"; ctx.font = `italic 800 118px ${DISP}`; ctx.fillText(o.titulo.toUpperCase(), 70, 300);
  ctx.fillStyle = "#8d97a8"; ctx.font = `600 40px ${BODY}`;
  wrap(ctx, o.filtros.toUpperCase(), W - 140, 2).forEach((l, i) => ctx.fillText(l, 70, 365 + i * 52));

  ctx.textAlign = "center";
  ctx.fillStyle = VOLT; ctx.font = `italic 800 560px ${DISP}`; ctx.fillText(`${pos}º`, W / 2, 1010);
  ctx.fillStyle = "#f3f5f7"; ctx.font = `italic 800 84px ${DISP}`; ctx.fillText(`${valor(me)} · ${pos === 1 ? "LÍDER" : "DE " + o.rows.length + " CORREDORES"}`, W / 2, 1110);

  // mini ranking: top 5, ou top 4 + reticências + eu
  const lista = o.meIdx < 5 ? o.rows.slice(0, 5).map((r, i) => [r, i]) : [...o.rows.slice(0, 3).map((r, i) => [r, i]), null, [me, o.meIdx]];
  const imgs = await Promise.all(lista.map(x => x ? loadImg(x[0].avatar_url) : null));
  let y = 1190;
  lista.forEach((it, k) => {
    if (!it) { ctx.fillStyle = "#8d97a8"; ctx.font = `800 50px ${BODY}`; ctx.textAlign = "center"; ctx.fillText("⋮", W / 2, y + 40); y += 56; return; }
    const [r, i] = it, eu = i === o.meIdx;
    if (eu) { ctx.fillStyle = "rgba(212,255,30,.16)"; ctx.beginPath(); ctx.roundRect(60, y, W - 120, 108, 18); ctx.fill(); ctx.strokeStyle = VOLT; ctx.lineWidth = 4; ctx.stroke(); }
    ctx.textAlign = "center"; ctx.fillStyle = eu ? VOLT : "#8d97a8"; ctx.font = `italic 800 64px ${DISP}`; ctx.fillText(String(i + 1), 125, y + 74);
    avatarCirc(ctx, imgs[k], r.nome, 215, y + 54, 38, eu ? VOLT : "#2a313c");
    ctx.textAlign = "left"; ctx.fillStyle = "#f3f5f7"; ctx.font = `700 42px ${BODY}`;
    let nome = r.nome; while (ctx.measureText(nome).width > 450 && nome.length > 3) nome = nome.slice(0, -2); if (nome !== r.nome) nome += "…";
    ctx.fillText(nome, 275, y + 66);
    ctx.textAlign = "right"; ctx.fillStyle = eu ? VOLT : "#f3f5f7"; ctx.font = `italic 800 58px ${DISP}`; ctx.fillText(valor(r), W - 90, y + 72);
    y += 120;
  });

  ctx.textAlign = "center"; ctx.fillStyle = VOLT; ctx.beginPath(); ctx.roundRect(70, 1800, W - 140, 66, 12); ctx.fill();
  ctx.fillStyle = INK; ctx.font = `italic 800 52px ${DISP}`; ctx.fillText("CORRIDA RANK · AQUI SÓ VALE PROVA", W / 2, 1851);
  return await new Promise(res => c.toBlob(res, "image/png"));
}
export async function compartilharRanking(o) {
  const me = o.rows[o.meIdx];
  return entregar(await cartaoRanking(o), `Estou em ${o.meIdx + 1}º no ${o.titulo} (${o.filtros}) com ${o.tempos ? fmtTime(me.tempo_s) : fmtNum(me.pontos) + " pts"}. #CorridaRank`);
}

// Cartão dos selos. o: { nome, cidade, avatar_url, dist: [{lab, nome, n}], cid: [{nome, n}] }
const COR = { bronze: ["#d08a4a", "#4a3118", "#f1c9a0"], prata: ["#dfe5ee", "#4b5562", "#ffffff"], ouro: ["#ffd24a", "#5a4510", "#ffe9a3"] };
function selo(ctx, cx, cy, anel, nome, n, img = null) {
  const nv = nivelDe(n), prox = proximoNivel(n), R = 92;
  if (nv) {
    const [borda, fundoCor, txt] = COR[nv[1]];
    const g = ctx.createRadialGradient(cx - 30, cy - 35, 10, cx, cy, R); g.addColorStop(0, fundoCor); g.addColorStop(1, "#14110a");
    ctx.shadowColor = borda + "88"; ctx.shadowBlur = 30; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = borda; ctx.lineWidth = 10; ctx.stroke(); ctx.fillStyle = txt;
  } else {
    ctx.fillStyle = "#12161b"; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
    ctx.setLineDash([16, 14]); ctx.strokeStyle = "#3a424f"; ctx.lineWidth = 8; ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = "#4b5460";
  }
  if (img && nv) {   // bandeira da cidade dentro da medalha
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R - 8, 0, 7); ctx.clip();
    const k = Math.max(((R - 8) * 2) / img.width, ((R - 8) * 2) / img.height);
    ctx.drawImage(img, cx - img.width * k / 2, cy - img.height * k / 2, img.width * k, img.height * k); ctx.restore();
  } else { ctx.textAlign = "center"; ctx.font = `italic 800 ${anel.length > 2 ? 84 : 78}px ${DISP}`; ctx.fillText(anel, cx, cy + 28); }
  ctx.fillStyle = nv ? "#f3f5f7" : "#6d7685"; ctx.font = `700 36px ${BODY}`;
  let t = nome; while (ctx.measureText(t).width > 290 && t.length > 3) t = t.slice(0, -2); if (t !== nome) t += "…";
  ctx.fillText(t, cx, cy + R + 52);
  ctx.fillStyle = nv ? COR[nv[1]][0] : "#6d7685"; ctx.font = `700 28px ${BODY}`;
  ctx.fillText(`${nv ? nv[2].toUpperCase() : "BLOQUEADO"} · ${prox ? n + "/" + prox : n + " ✓"}`, cx, cy + R + 90);
}
export async function cartaoSelos(o) {
  await fontes();
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d");
  fundo(ctx); logo(ctx);
  const bandeiras = await Promise.all(o.cid.slice(0, 3).map(c => loadImg(c.bandeira)));
  const total = o.dist.filter(d => d.n > 0).length + o.cid.length;
  ctx.textAlign = "left"; ctx.fillStyle = "#f3f5f7"; ctx.font = `italic 800 118px ${DISP}`; ctx.fillText("MEUS SELOS", 70, 300);
  const img = await loadImg(o.avatar_url);
  avatarCirc(ctx, img, o.nome, 120, 420, 52, VOLT);
  ctx.textAlign = "left"; ctx.fillStyle = "#f3f5f7"; ctx.font = `italic 800 60px ${DISP}`; ctx.fillText((o.nome || "").toUpperCase(), 195, 428);
  ctx.fillStyle = "#8d97a8"; ctx.font = `600 34px ${BODY}`; ctx.fillText("📍 " + (o.cidade || ""), 195, 472);

  ctx.textAlign = "center"; ctx.fillStyle = VOLT; ctx.font = `italic 800 220px ${DISP}`; ctx.fillText(String(total), W / 2, 690);
  ctx.fillStyle = "#f3f5f7"; ctx.font = `italic 800 70px ${DISP}`; ctx.fillText(total === 1 ? "SELO CONQUISTADO" : "SELOS CONQUISTADOS", W / 2, 765);

  const xs = [W / 2 - 330, W / 2, W / 2 + 330];
  ctx.textAlign = "left"; ctx.fillStyle = VOLT; ctx.font = `italic 800 52px ${DISP}`; ctx.fillText("POR DISTÂNCIA", 70, 850);
  o.dist.forEach((d, i) => selo(ctx, xs[i % 3], 950 + Math.floor(i / 3) * 292, d.lab, d.nome, d.n));
  if (o.cid.length) {
    ctx.textAlign = "left"; ctx.fillStyle = VOLT; ctx.font = `italic 800 52px ${DISP}`; ctx.fillText("POR CIDADE", 70, 1510);
    o.cid.slice(0, 3).forEach((d, i) => selo(ctx, xs[i], 1622, "📍", d.nome, d.n, bandeiras[i]));
    if (o.cid.length > 3) { ctx.textAlign = "right"; ctx.fillStyle = "#8d97a8"; ctx.font = `600 34px ${BODY}`; ctx.fillText(`+${o.cid.length - 3} cidades`, W - 70, 1510); }
  }
  ctx.textAlign = "center"; ctx.fillStyle = VOLT; ctx.beginPath(); ctx.roundRect(70, 1830, W - 140, 56, 12); ctx.fill();
  ctx.fillStyle = INK; ctx.font = `italic 800 44px ${DISP}`; ctx.fillText("CORRIDA RANK · AQUI SÓ VALE PROVA", W / 2, 1872);
  return await new Promise(res => cv.toBlob(res, "image/png"));
}
export async function compartilharSelos(o) {
  const n = o.dist.filter(d => d.n > 0).length + o.cid.length;
  return entregar(await cartaoSelos(o), `Já conquistei ${n} selo${n === 1 ? "" : "s"} no Corrida Rank! #CorridaRank`);
}
