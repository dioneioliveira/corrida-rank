// Leitor da Chiprun (chiprun.com.br/evento/...): páginas em HTML com um "cartão" por atleta (20 por página) e busca própria (?busca=).
import { norm, parseTempo } from "./resultados.js";

const dec = s => String(s ?? "").replace(/&#0?38;|&amp;/g, "&").replace(/&#8211;/g, "–").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").trim();
const semTags = h => dec(h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, "|").replace(/\s+/g, " ").replace(/(\| ?)+/g, "| "));

export const ehChiprun = host => host === "chiprun.com.br" || host.endsWith(".chiprun.com.br");

// "5 KM", "5 KM - PCD", "21K", "10,5 km" → { dist_cat, distancia_km }
export function modalidadeParaDistancia(m) {
  const x = String(m ?? "").match(/(\d+(?:[.,]\d+)?)\s*k/i); if (!x) return null;
  const km = parseFloat(x[1].replace(",", "."));
  const mapa = { 3: "3k", 5: "5k", 10: "10k", 15: "15k", 21: "21k", 42: "42k" };
  const fixo = mapa[Math.round(km)];
  if (fixo && Math.abs(km - Math.round(km)) < 0.3) return { dist_cat: fixo, distancia_km: Math.round(km) === 21 ? 21.1 : Math.round(km) === 42 ? 42.2 : Math.round(km) };
  return { dist_cat: "outra", distancia_km: km };
}

export function parseChiprun(html) {
  const titulo = dec((html.match(/<div class="text-2xl font-bold">([^<]*)<\/div>/) || [])[1]);
  const cidade = dec((html.match(/<span class="font-bold">([^<]*)<\/span>/) || [])[1]);
  const d = html.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  const paginas = Math.max(1, ...[...html.matchAll(/pagina=(\d+)/g)].map(m => +m[1]));
  const partes = html.split('class="nome-atleta">').slice(1);
  const atletas = partes.map(p => {
    const nomeBruto = dec(p.slice(0, p.indexOf("</div>")));
    const m = nomeBruto.match(/^#?(\d+)\s*-\s*(.+)$/);
    const t = semTags(p.slice(p.indexOf("</div>")));
    const pega = (re) => (t.match(re) || [])[1];
    const cat = (p.match(/fa-address-card[^>]*><\/i>\s*([^<]*)</) || [])[1];
    const modalidade = (p.match(/fa-flag-checkered[^>]*><\/i>\s*([^<]*)</) || [])[1];
    const idade = (p.match(/fa-birthday-cake[^>]*><\/i>\s*(\d+)/) || [])[1];
    const pc = pega(/Por Categoria\s*\|[^|]*\|?\s*(\d+|-)\s*\|/) ?? pega(/Por Categoria\s*\|\s*(\d+|-)/);
    return {
      numero: m ? m[1] : null, nome: m ? m[2].trim() : nomeBruto,
      categoria: cat ? dec(cat) : null, modalidade: modalidade ? dec(modalidade) : null, idade: idade ? +idade : null,
      liquido_s: parseTempo(pega(/Tempo Final\s*\|\s*([\d:]+)/)), bruto_s: parseTempo(pega(/Tempo Bruto\s*\|\s*([\d:]+)/)),
      pos_geral: +(pega(/Classif\. Geral\s*\|[^|]*?(\d+)\s*º/) || 0) || null,
      pos_cat: pc && pc !== "-" ? +pc : null };
  });
  return { titulo, cidade, data_prova: d ? `${d[3]}-${d[2]}-${d[1]}` : null, paginas, atletas };
}

// Escolhe o termo de busca: nº de peito (mais preciso) ou o primeiro nome
export function termoDeBusca(nome, peito) {
  const n = String(peito ?? "").replace(/\D/g, ""); if (n) return n;
  const t = norm(nome).split(" ").filter(x => x.length >= 3); return t[0] ?? "";
}
export function filtrarAtletas(atletas, nome, peito) {
  const n = String(peito ?? "").replace(/\D/g, ""), q = norm(nome).split(" ").filter(Boolean);
  return atletas.filter(a => n ? a.numero === n : q.every(t => norm(a.nome).includes(t)));
}
