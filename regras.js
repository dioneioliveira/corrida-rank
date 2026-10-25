// Mesma fórmula do banco (view v_provas). Usada só para explicar e simular; os pontos oficiais vêm do banco.
export const PARTICIPACAO = 10;
export const PODIO_GERAL = [20, 12, 6];
export const PODIO_CATEGORIA = [10, 6, 3];
export const PESOS = [[7, 1, "até 7 km"], [16, 1.25, "de 7 a 16 km"], [30, 1.75, "de 16 a 30 km"], [Infinity, 2.5, "acima de 30 km"]];

export const peso = km => PESOS.find(p => km <= p[0])[1];
export const baseRelativa = (pos, total) => 100 * (total - pos + 1) / total;

// Retorna as partes do cálculo para mostrar passo a passo (ou null se faltar dado/inválido)
export function calcular(km, total, pos, podio) {
  if (!(km > 0) || !(total >= 1) || !(pos >= 1) || pos > total) return null;
  const base = baseRelativa(pos, total), bonus = podio[pos - 1] || 0, w = peso(km);
  return { participacao: PARTICIPACAO, base, bonus, peso: w, total: Math.round(w * (PARTICIPACAO + base + bonus) * 10) / 10 };
}

// Selos: 1 prova = bronze, 3 = prata, 5 = ouro
export const NIVEIS = [[5, "ouro", "Ouro"], [3, "prata", "Prata"], [1, "bronze", "Bronze"]];
export const nivelDe = n => NIVEIS.find(x => n >= x[0]);
export const proximoNivel = n => (NIVEIS.slice().reverse().find(x => n < x[0]) || [null])[0];

// Formatação brasileira (vírgula decimal)
export const fmtNum = (x, d = 1) => Number(x).toFixed(d).replace(".", ",");
export const fmtKm = x => String(+x).replace(".", ",");
