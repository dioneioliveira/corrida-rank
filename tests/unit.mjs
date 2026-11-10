import assert from "node:assert/strict";
import { calcular, peso, baseRelativa, PESOS, PODIO_GERAL } from "../regras.js";
// pesos por distância
assert.equal(peso(5), 1); assert.equal(peso(10), 1.25); assert.equal(peso(21), 1.75); assert.equal(peso(42), 2.5);
// base relativa: último colocado = 100/total, primeiro = 100
assert.equal(baseRelativa(1, 100), 100); assert.equal(baseRelativa(100, 100), 1);
// 5 km, 100 inscritos, 1º lugar: (10 + 100 + 20) * 1
const r = calcular(5, 100, 1, PODIO_GERAL); console.log("calcular ->", r);
assert.equal(r.total, 130);
assert.equal(calcular(10, 100, 6, PODIO_GERAL).total, 131.3, "6º lugar não tem bônus");
assert.equal(calcular(5, 10, 11, PODIO_GERAL), null);
assert.equal(PESOS.length, 4);
console.log("OK: regras de pontuação");
