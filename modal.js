// Janelas simples (no lugar de prompt/confirm do navegador, que ficam feios no celular)
function abrir(html) {
  const fundo = document.createElement("div"); fundo.className = "foto-fundo"; fundo.innerHTML = `<div class="foto-caixa modal" role="dialog">${html}</div>`;
  document.body.appendChild(fundo); return fundo;
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Pede um texto. Retorna a string ou null se cancelar.
export function pedirTexto({ titulo, dica = "", rotulo = "Enviar", minimo = 0, maximo = 300, valor = "" }) {
  return new Promise(resolve => {
    const f = abrir(`<div class="foto-tit">${esc(titulo)}</div>${dica ? `<div class="foto-dica" style="margin:0 0 8px">${esc(dica)}</div>` : ""}
      <textarea class="modal-txt" rows="4" maxlength="${maximo}" placeholder="Escreva aqui">${esc(valor)}</textarea><div class="err" id="mErr"></div>
      <div class="foto-acoes"><button type="button" class="btn ghost" data-a="x">Cancelar</button><button type="button" class="btn" data-a="ok">${esc(rotulo)}</button></div>`);
    const t = f.querySelector("textarea"); t.focus();
    const fechar = v => { f.remove(); resolve(v); };
    f.querySelector('[data-a="x"]').onclick = () => fechar(null);
    f.querySelector('[data-a="ok"]').onclick = () => { const v = t.value.trim(); if (v.length < minimo) return f.querySelector("#mErr").textContent = `Escreva pelo menos ${minimo} caracteres.`; fechar(v); };
  });
}

// Pede confirmação. Retorna true/false.
export function confirmarModal({ titulo, texto = "", rotulo = "Confirmar", perigo = false }) {
  return new Promise(resolve => {
    const f = abrir(`<div class="foto-tit">${esc(titulo)}</div>${texto ? `<p class="sub" style="margin:0 0 12px">${esc(texto)}</p>` : ""}
      <div class="foto-acoes"><button type="button" class="btn ghost" data-a="x">Cancelar</button><button type="button" class="btn" data-a="ok" ${perigo ? 'style="background:var(--bad);color:#fff"' : ""}>${esc(rotulo)}</button></div>`);
    const fechar = v => { f.remove(); resolve(v); };
    f.querySelector('[data-a="x"]').onclick = () => fechar(false); f.querySelector('[data-a="ok"]').onclick = () => fechar(true);
  });
}
