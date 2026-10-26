// Bandeira do município: acha o item no Wikidata pelo nome, lê a propriedade "bandeira" (P41) e monta a URL no Wikimedia Commons.
const CHAVE = "bandeiras-v1";
let cache = {};
try { cache = JSON.parse(localStorage.getItem(CHAVE) || "{}"); } catch { cache = {}; }
const gravar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cache)); } catch { /* sem armazenamento: só não guarda */ } };
const emAndamento = {};
const api = "https://www.wikidata.org/w/api.php?format=json&origin=*&";

const ehMunicipio = d => /munic[ií]pio|cidade|city in brazil|municipality of brazil/i.test(d || "");

// Retorna a URL da bandeira (PNG/SVG redimensionado) ou null se a cidade não tiver; undefined em falha de rede (tenta de novo depois).
export function bandeiraDaCidade(nome) {
  const k = String(nome ?? "").trim().toLowerCase();
  if (!k) return Promise.resolve(null);
  if (k in cache) return Promise.resolve(cache[k]);
  return emAndamento[k] ||= (async () => {
    try {
      const busca = await (await fetch(api + "action=wbsearchentities&type=item&limit=8&language=pt&uselang=pt&search=" + encodeURIComponent(nome))).json();
      const alvo = (busca.search || []).find(e => ehMunicipio(e.description));
      let url = null;
      if (alvo) {
        const c = await (await fetch(api + "action=wbgetclaims&property=P41&entity=" + alvo.id)).json();
        const arquivo = c.claims?.P41?.[0]?.mainsnak?.datavalue?.value;
        if (arquivo) url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(arquivo) + "?width=160";
      }
      cache[k] = url; gravar(); return url;
    } catch { return undefined; } finally { delete emAndamento[k]; }
  })();
}
