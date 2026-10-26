// Editor de enquadramento da foto de perfil: arrastar para mover, pinça/controle para ampliar. Devolve um JPEG quadrado.
const T = 300;   // tamanho da área de edição (px)

function carregar(origem) {
  return new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => res(img); img.onerror = () => rej(new Error("Não foi possível abrir a imagem."));
    img.src = origem instanceof Blob ? URL.createObjectURL(origem) : origem;
  });
}

// origem: File/Blob ou URL. saida: lado do JPEG final. Retorna Blob ou null (cancelado).
export async function reenquadrar(origem, saida = 256) {
  const img = await carregar(origem);
  return new Promise(resolve => {
    const base = Math.max(T / img.width, T / img.height);
    let zoom = 1, ox = (T - img.width * base) / 2, oy = (T - img.height * base) / 2;   // começa centralizada
    const esc = () => base * zoom;
    const limitar = () => { ox = Math.min(0, Math.max(T - img.width * esc(), ox)); oy = Math.min(0, Math.max(T - img.height * esc(), oy)); };

    const fundo = document.createElement("div");
    fundo.className = "foto-fundo";
    fundo.innerHTML = `<div class="foto-caixa" role="dialog" aria-label="Enquadrar foto">
      <div class="foto-tit">Enquadre o rosto</div>
      <canvas width="${T}" height="${T}" class="foto-tela"></canvas>
      <div class="foto-dica">Arraste para mover. Use o controle ou a pinça para aproximar.</div>
      <input type="range" min="1" max="5" step="0.01" value="1" class="foto-zoom" aria-label="Zoom">
      <div class="foto-acoes"><button type="button" class="btn ghost" data-a="x">Cancelar</button><button type="button" class="btn" data-a="ok">Salvar foto</button></div></div>`;
    document.body.appendChild(fundo);
    const cv = fundo.querySelector("canvas"), ctx = cv.getContext("2d"), zr = fundo.querySelector(".foto-zoom");

    const desenhar = () => {
      limitar(); ctx.clearRect(0, 0, T, T);
      ctx.drawImage(img, ox, oy, img.width * esc(), img.height * esc());
      ctx.save(); ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.beginPath(); ctx.rect(0, 0, T, T); ctx.arc(T / 2, T / 2, T / 2 - 2, 0, Math.PI * 2, true); ctx.fill("evenodd"); ctx.restore();
      ctx.strokeStyle = "#d4ff1e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(T / 2, T / 2, T / 2 - 2, 0, Math.PI * 2); ctx.stroke();
    };
    // zoom mantendo fixo o ponto (cx, cy) da tela
    const ampliar = (novo, cx = T / 2, cy = T / 2) => {
      novo = Math.min(5, Math.max(1, novo)); const f = novo / zoom;
      ox = cx - (cx - ox) * f; oy = cy - (cy - oy) * f; zoom = novo; zr.value = zoom; desenhar();
    };
    zr.oninput = () => ampliar(+zr.value);
    cv.onwheel = e => { e.preventDefault(); ampliar(zoom * (e.deltaY < 0 ? 1.08 : 0.93)); };

    const toques = new Map(); let dist0 = 0, zoom0 = 1;
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * T / r.width, (e.clientY - r.top) * T / r.height]; };
    cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); toques.set(e.pointerId, pos(e)); if (toques.size === 2) { const [a, b] = [...toques.values()]; dist0 = Math.hypot(a[0] - b[0], a[1] - b[1]); zoom0 = zoom; } };
    cv.onpointermove = e => {
      if (!toques.has(e.pointerId)) return;
      const [x, y] = pos(e), [px, py] = toques.get(e.pointerId); toques.set(e.pointerId, [x, y]);
      if (toques.size === 1) { ox += x - px; oy += y - py; desenhar(); }
      else if (toques.size === 2) { const [a, b] = [...toques.values()]; ampliar(zoom0 * Math.hypot(a[0] - b[0], a[1] - b[1]) / dist0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
    };
    cv.onpointerup = cv.onpointercancel = e => toques.delete(e.pointerId);

    const fechar = r => { fundo.remove(); if (origem instanceof Blob) URL.revokeObjectURL(img.src); resolve(r); };
    fundo.querySelector('[data-a="x"]').onclick = () => fechar(null);
    fundo.querySelector('[data-a="ok"]').onclick = () => {
      const o = document.createElement("canvas"); o.width = o.height = saida; const c = o.getContext("2d"), k = saida / T;
      c.drawImage(img, ox * k, oy * k, img.width * esc() * k, img.height * esc() * k);
      o.toBlob(b => fechar(b), "image/jpeg", 0.88);
    };
    desenhar();
  });
}
