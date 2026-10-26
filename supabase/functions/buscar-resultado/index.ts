// Lê uma página de resultados (HTML/JSON/CSV) e devolve os dados do corredor: tempo, posição geral, inscritos, categoria...
// Entrada (POST, usuário logado): { url: "https://...", nome?: string, peito?: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { analisar } from "../_shared/resultados.js";
import { ehChiprun, filtrarAtletas, modalidadeParaDistancia, parseChiprun, termoDeBusca } from "../_shared/chiprun.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MAX_BYTES = 5 * 1024 * 1024, TIMEOUT_MS = 12_000, MAX_REDIRECTS = 3;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Impede que o servidor seja usado para acessar rede interna (SSRF)
function ipPrivado(ip: string): boolean {
  if (ip.includes(":")) { const x = ip.toLowerCase(); return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:"); }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
async function validar(u: URL) {
  if (u.protocol !== "https:") throw new Error("Use um link https://");
  if (u.username || u.password) throw new Error("Link inválido");
  const h = u.hostname;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) throw new Error("Endereço não permitido");
  if (/^[\d.]+$/.test(h) || h.includes(":")) { if (ipPrivado(h)) throw new Error("Endereço não permitido"); return; }
  const ips: string[] = [];
  for (const t of ["A", "AAAA"] as const) { try { ips.push(...(await Deno.resolveDns(h, t))); } catch { /* sem registro */ } }
  if (!ips.length) throw new Error("Não encontrei esse site");
  if (ips.some(ipPrivado)) throw new Error("Endereço não permitido");
}
async function baixar(url: string) {
  let atual = new URL(url);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    await validar(atual);
    const r = await fetch(atual, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CorridaRank/1.0)", Accept: "text/html,application/json,text/csv,*/*;q=0.5", "Accept-Language": "pt-BR,pt;q=0.9" } });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { atual = new URL(r.headers.get("location")!, atual); continue; }
    if (!r.ok) throw new Error(`O site respondeu ${r.status}`);
    const tipo = r.headers.get("content-type") ?? "";
    if (/pdf|image|zip|octet-stream|excel|spreadsheet/i.test(tipo)) throw new Error("O link é um arquivo (PDF/planilha). Abra a página de resultados do site ou digite os dados à mão.");
    const reader = r.body!.getReader(); const partes: Uint8Array[] = []; let total = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > MAX_BYTES) { await reader.cancel(); throw new Error("Página grande demais"); } partes.push(value); }
    const buf = new Uint8Array(total); let o = 0; for (const p of partes) { buf.set(p, o); o += p.length; }
    let cs = /charset=([\w-]+)/i.exec(tipo)?.[1];
    if (!cs) cs = /<meta[^>]+charset=["']?([\w-]+)/i.exec(new TextDecoder("latin1").decode(buf.slice(0, 2048)))?.[1];
    let texto: string; try { texto = new TextDecoder(cs ?? "utf-8").decode(buf); } catch { texto = new TextDecoder("utf-8").decode(buf); }
    return { texto, tipo, urlFinal: atual.toString() };
  }
  throw new Error("Redirecionamentos demais");
}

// Chiprun: usa a busca do próprio site e calcula os totais (inscritos geral e da categoria) pela paginação.
async function buscarChiprun(u: URL, nome: string, peito: string) {
  const base = u.origin + u.pathname, modalidade = u.searchParams.get("modalidade");
  const ler = async (extra: Record<string, string>) => {
    const q = new URLSearchParams(); if (modalidade) q.set("modalidade", modalidade);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return parseChiprun((await baixar(`${base}?${q}`)).texto);
  };
  const contar = async (extra: Record<string, string>) => {
    const p1 = await ler({ ...extra, pagina: "1" });
    if (p1.paginas <= 1) return p1.atletas.length;
    const ult = await ler({ ...extra, pagina: String(p1.paginas) });
    return (p1.paginas - 1) * p1.atletas.length + ult.atletas.length;
  };
  const busca = termoDeBusca(nome, peito);
  let primeira = await ler({ busca, pagina: "1" }); const achados = [...primeira.atletas];
  for (let pg = 2; pg <= Math.min(primeira.paginas, 4); pg++) achados.push(...(await ler({ busca, pagina: String(pg) })).atletas);
  const sel = filtrarAtletas(achados, nome, peito).filter((a: { liquido_s: number | null }) => a.liquido_s).slice(0, 4);
  const meta = { titulo: primeira.titulo, cidade_prova: primeira.cidade, data_prova: primeira.data_prova, ...(modalidadeParaDistancia(sel[0]?.modalidade ?? modalidade) ?? {}) };
  const inscritos = sel.length ? await contar({}) : 0, porCat: Record<string, number> = {};
  const candidatos = [];
  for (const a of sel) {
    if (a.categoria && a.pos_cat && !(a.categoria in porCat)) porCat[a.categoria] = await contar({ faixa_etaria: a.categoria });
    const comCat = a.categoria && a.pos_cat;
    candidatos.push({ nome: a.nome, peito: a.numero, tempo_s: a.liquido_s, pos_geral: a.pos_geral, pos_geral_calculada: false, inscritos,
      categoria: a.categoria, insc_cat: comCat ? porCat[a.categoria] : null, pos_cat: comCat ? a.pos_cat : null, pos_cat_calculada: comCat ? false : null,
      sexo: a.categoria ? (a.categoria[0] === "F" ? "F" : a.categoria[0] === "M" ? "M" : null) : null, parcial: false, linhas_na_tabela: inscritos });
  }
  return { fonte: u.toString(), titulo: meta.titulo, meta, candidatos,
    aviso: candidatos.length ? null : "Não encontrei esse nome na Chiprun para essa modalidade. Confira o nome ou use o número de peito." };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: u } = await admin.auth.getUser(jwt);
    if (!u.user) return json({ erro: "não autenticado" }, 401);
    const { url, nome, peito } = await req.json();
    if (typeof url !== "string" || url.length > 600) return json({ erro: "Cole o link da página de resultados." }, 400);
    if (!(nome && String(nome).trim().length >= 3) && !String(peito ?? "").trim()) return json({ erro: "Informe seu nome (ou o número de peito)." }, 400);

    let alvo: URL; try { alvo = new URL(url); } catch { return json({ erro: "Link inválido." }, 400); }
    if (ehChiprun(alvo.hostname) && alvo.pathname.startsWith("/evento/")) return json(await buscarChiprun(alvo, String(nome ?? ""), String(peito ?? "")));

    const { texto, tipo, urlFinal } = await baixar(url);
    const r = analisar(texto, tipo, { nome: String(nome ?? ""), peito: String(peito ?? "") });
    let aviso: string | null = null;
    if (!r.tabelas) aviso = "Não encontrei uma tabela de resultados nessa página (alguns sites carregam os resultados por JavaScript). Abra a classificação geral do site e cole o link dela, ou digite os dados à mão.";
    else if (!r.candidatos.length) aviso = "Achei a tabela, mas não encontrei esse nome. Tente o nome como aparece no site, ou o número de peito.";
    return json({ fonte: urlFinal, titulo: r.titulo, candidatos: r.candidatos, aviso });
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 422);
  }
});
