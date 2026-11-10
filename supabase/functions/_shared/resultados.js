// Leitura de páginas de resultados de provas (HTML com tabelas, JSON ou CSV). Código puro: roda no Deno (Edge Function) e no Node (testes).

export const norm = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ordm: "º", ordf: "ª", deg: "°" };
const decode = s => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return isNaN(n) ? m : String.fromCodePoint(n); }
  return ENT[e.toLowerCase()] ?? m; });
const texto = h => decode(h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

export function extrairTabelas(html) {
  const out = [];
  for (const t of html.match(/<table[\s\S]*?<\/table>/gi) || []) {
    const linhas = (t.match(/<tr[\s\S]*?<\/tr>/gi) || []).map(tr => [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => texto(c[1])));
    if (linhas.length >= 2) out.push(linhas.filter(l => l.length));
  }
  return out;
}
export const tituloDaPagina = html => { const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? texto(m[1]) : ""; };

// "1:23:45", "23:38", "0:23:38.45", "00:23:38,5" → segundos (ou null)
export function parseTempo(s) {
  const m = String(s ?? "").trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,]\d+)?$/);
  if (!m) return null;
  const t = (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]);
  return t > 0 ? t : null;
}

function mapaColunas(cab) {
  const h = cab.map(norm), idx = re => h.findIndex(x => re.test(x));
  const ehCat = /(cat|faixa|idade|escal)/;
  const poscat = idx(/^(pos|class|coloc|lugar)[^a-z]*(cat|faixa|idade)|^(cat|faixa)[a-z.]*\s*(pos|class|coloc|lugar)|^(pos|cl)\.? ?cat/);
  const categoria = h.findIndex((x, i) => i !== poscat && /^(categoria|cat\.?|faixa( etaria)?|escalao)\b/.test(x) && !/(pos|class|coloc)/.test(x));
  const pos = h.findIndex((x, i) => i !== poscat && /^(pos|class|coloc|lugar|geral|#|rank)/.test(x) && !ehCat.test(x) && !/(sexo|masc|fem|genero)/.test(x));
  const liquido = idx(/liquido|chip|oficial|net/), bruto = idx(/bruto|gun|tiro/);
  const tempoGen = h.findIndex((x, i) => /^(tempo|time|resultado)/.test(x) && !/(parcial|km|pace|ritmo|meta)/.test(x) && i !== bruto);
  return { nome: idx(/^(nome|atleta|participante|corredor|competidor|name)/), pos, poscat, categoria,
    tempo: liquido >= 0 ? liquido : tempoGen >= 0 ? tempoGen : bruto, sexo: idx(/^(sexo|genero|sx|sex)$/), peito: idx(/^(n[º°o]?\.?|num|numero|peito|bib)$/) };
}
const inteiro = s => { const m = String(s ?? "").match(/\d+/); return m ? +m[0] : null; };
const sexoDe = (sx, cat) => { const x = norm(sx || ""), c = norm(cat || ""); return /^(m|masc)/.test(x) ? "M" : /^(f|fem)/.test(x) ? "F" : /^(m|masc)\b|^m\d/.test(c) ? "M" : /^(f|fem)\b|^f\d/.test(c) ? "F" : null; };

// Procura o corredor numa tabela (matriz de strings; o cabeçalho pode não ser a 1ª linha)
export function buscarNaTabela(tab, { nome, peito }, htmlTemPaginacao = false) {
  const hi = tab.findIndex(l => l.length >= 3 && mapaColunas(l).tempo >= 0 && (mapaColunas(l).nome >= 0 || mapaColunas(l).peito >= 0));
  if (hi < 0) return [];
  const cab = tab[hi], c = mapaColunas(cab), linhas = tab.slice(hi + 1).filter(l => l.length >= Math.min(cab.length, 3));
  const fin = linhas.map(l => ({ l, t: parseTempo(l[c.tempo]) })).filter(x => x.t);
  if (!fin.length) return [];
  const q = norm(nome || "").split(" ").filter(Boolean), nPeito = String(peito || "").replace(/\D/g, "");
  const cands = [];
  fin.forEach((x, i) => {
    const nm = norm(c.nome >= 0 ? x.l[c.nome] : "");
    const okNome = q.length ? q.every(t => nm.includes(t)) : true;
    const okPeito = nPeito ? c.peito >= 0 && String(x.l[c.peito]).replace(/\D/g, "") === nPeito : true;
    if (!(q.length || nPeito) || !okNome || !okPeito) return;
    const cat = c.categoria >= 0 ? x.l[c.categoria].trim() : "";
    const mesmaCat = cat ? fin.filter(y => norm(y.l[c.categoria]) === norm(cat)) : [];
    const posCalc = cat ? mesmaCat.indexOf(x) + 1 : null;
    const posCol = c.pos >= 0 ? inteiro(x.l[c.pos]) : null, posCatCol = cat && c.poscat >= 0 ? inteiro(x.l[c.poscat]) : null;
    cands.push({
      nome: c.nome >= 0 ? x.l[c.nome] : nome, peito: c.peito >= 0 ? x.l[c.peito] : null, tempo_s: x.t,
      pos_geral: posCol || i + 1, pos_geral_calculada: !posCol,
      inscritos: fin.length,
      categoria: cat || null, insc_cat: cat ? mesmaCat.length : null,
      pos_cat: cat ? (posCatCol || posCalc) : null, pos_cat_calculada: cat ? !posCatCol : null,
      sexo: sexoDe(c.sexo >= 0 ? x.l[c.sexo] : "", cat),
      // tabelas com 10/20/25/50/100... linhas e paginação costumam estar cortadas: os totais podem estar subestimados
      parcial: htmlTemPaginacao && [10, 15, 20, 25, 30, 40, 50, 100, 200].includes(fin.length),
      linhas_na_tabela: fin.length });
  });
  return cands;
}

function csvParaTabela(txt) {
  const p = txt.split("\n")[0], sep = (p.match(/;/g) || []).length >= (p.match(/,/g) || []).length ? ";" : ",";
  return txt.split(/\r?\n/).filter(Boolean).map(l => { const o = []; let cur = "", q = false;
    for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { o.push(cur); cur = ""; } else cur += ch; } o.push(cur); return o.map(s => s.trim()); });
}
function jsonParaTabela(j) {
  const arr = Array.isArray(j) ? j : Object.values(j || {}).find(v => Array.isArray(v) && v.length && typeof v[0] === "object");
  if (!arr || !arr.length || typeof arr[0] !== "object") return null;
  const cols = Object.keys(arr[0]); return [cols, ...arr.map(o => cols.map(k => (o[k] == null || typeof o[k] === "object" ? "" : String(o[k]))))];
}

// Ponto de entrada: corpo (texto) + tipo de conteúdo
export function analisar(corpo, tipo, consulta) {
  const t = (tipo || "").toLowerCase(); let tabelas = [], titulo = "", pag = false;
  if (t.includes("json")) { try { const x = jsonParaTabela(JSON.parse(corpo)); if (x) tabelas = [x]; } catch { /* ignora */ } }
  else if (t.includes("csv") || (!t.includes("html") && /^[^<]*[;,][^<]*\n/.test(corpo))) tabelas = [csvParaTabela(corpo)];
  else { tabelas = extrairTabelas(corpo); titulo = tituloDaPagina(corpo); pag = /pr[oó]xima|pagina[cç][aã]o|pagination|[?&]pag(e|ina)?=|>\s*next\s*</i.test(corpo); }
  const candidatos = tabelas.flatMap(tb => buscarNaTabela(tb, consulta, pag));
  const vistos = new Set(); const unicos = candidatos.filter(c => { const k = norm(c.nome) + c.tempo_s; if (vistos.has(k)) return false; vistos.add(k); return true; });
  unicos.sort((a, b) => b.linhas_na_tabela - a.linhas_na_tabela);
  return { titulo, candidatos: unicos.slice(0, 8), tabelas: tabelas.length };
}

// ---- Dados da prova lidos de uma página qualquer (nome, data, cidade, distância) ----
const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
const iso = (a, m, d) => { const dt = new Date(Date.UTC(a, m - 1, d)); return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && a >= 2000 ? `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null; };
const metaTag = (html, nome) => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${nome}["'][^>]*content=["']([^"']*)["']`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${nome}["']`, "i")); return m ? decode(m[1]).trim() : ""; };

export function extrairMeta(html, url = "") {
  const corpo = texto(html), hoje = new Date().toISOString().slice(0, 10);
  let titulo = metaTag(html, "og:title") || texto((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "") || tituloDaPagina(html);
  titulo = titulo.split(/\s+[|·•]\s+|\s+[-–—]\s+(?=(?:resultados?|classifica|chiprun|cronometragem|inscri))/i)[0].replace(/^\s*(resultados?|classificação( geral)?)\s*(da|do|de)?\s*[:\-–]?\s*/i, "").trim();
  // data: JSON-LD/meta → dd/mm/aaaa → "15 de março de 2026"
  let data = null;
  const ld = html.match(/"startDate"\s*:\s*"(\d{4})-(\d{2})-(\d{2})/); if (ld) data = iso(+ld[1], +ld[2], +ld[3]);
  if (!data) { const m = corpo.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/); if (m) data = iso(+m[3], +m[2], +m[1]); }
  if (!data) { const m = norm(corpo).match(/\b(\d{1,2}) de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de (\d{4})/); if (m) data = iso(+m[3], MESES[m[2]], +m[1]); }
  if (data && data > hoje) data = null;
  // cidade: JSON-LD → "Cidade: X" / "Local: X"
  let cidade = (html.match(/"addressLocality"\s*:\s*"([^"]{2,60})"/) || [])[1] || "";
  if (!cidade) { const m = corpo.match(/\b(?:cidade|local)\s*:\s*([A-Za-zÀ-ÿ' ]{3,50}?)(?:\s*[-\/,|]\s*[A-Z]{2}\b|\s{2,}|$|\s(?:data|dist|modalidade|hor))/i); if (m) cidade = m[1].trim(); }
  // distância: título/URL primeiro; senão a única citada na página
  const distTxt = t => { const n = norm(t); if (/meia[- ]maratona/.test(n)) return "21k"; if (/\bmaratona\b/.test(n)) return "42k"; const v = [...new Set([...n.matchAll(/\b(\d{1,3}(?:[.,]\d{1,2})?)\s*k(?:m|ms)?\b/g)].map(x => x[1].replace(",", ".")))]; return v.length === 1 ? v[0] + "k" : v.length > 1 ? "varias" : null; };
  let dist = distTxt(titulo + " " + decodeURIComponent(url.replace(/\+/g, " ")));
  if (!dist || dist === "varias") dist = dist === "varias" ? null : distTxt(corpo.slice(0, 6000)); if (dist === "varias") dist = null;
  return { titulo, data_prova: data, cidade_prova: cidade || null, dist_texto: dist };
}
