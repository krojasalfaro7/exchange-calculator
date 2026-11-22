"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../rates.js");

// Datos reales de dolarapi del 2026-11-22 (domingo): el BCV ya publicó la del martes 24.
const HIST = [
  { fuente: "oficial", compra: null, venta: null, promedio: 917.7751, fecha: "2026-11-19" },
  { fuente: "oficial", compra: null, venta: null, promedio: 918.7662, fecha: "2026-11-20" },
  { fuente: "oficial", compra: null, venta: null, promedio: 919.8227, fecha: "2026-11-24" }
];
const DOLARES = [
  { moneda: "USD", fuente: "oficial", promedio: 918.7662, fechaActualizacion: "2026-11-20T00:00:00-04:00" },
  { moneda: "USD", fuente: "paralelo", promedio: 1089.26138, fechaActualizacion: "2026-11-22T12:01:18.557Z" }
];

test("caracasToday uses UTC-4, not the device's timezone", () => {
  assert.equal(R.caracasToday(new Date("2026-11-23T03:59:00Z")), "2026-11-22"); // 23:59 en Caracas
  assert.equal(R.caracasToday(new Date("2026-11-23T04:00:00Z")), "2026-11-23"); // 00:00 en Caracas
});

test("fmtFecha shows a short Spanish weekday and day", () => {
  assert.equal(R.fmtFecha("2026-11-24"), "mar 24");
  assert.equal(R.fmtFecha("2026-11-20"), "vie 20");
  assert.equal(R.fmtFecha("2026-11-22"), "dom 22");
  assert.equal(R.fmtFecha(null), "");
});

test("parseHistoricos keeps valid oficial entries sorted by fecha valor", () => {
  const entries = R.parseHistoricos([HIST[2], HIST[0], { fuente: "oficial", promedio: "x", fecha: "2026-11-21" }, HIST[1]]);
  assert.deepEqual(entries.map((e) => e.fecha), ["2026-11-19", "2026-11-20", "2026-11-24"]);
  assert.equal(entries[2].value, 919.8227);
  assert.deepEqual(R.parseHistoricos({ error: true }), []);
});

test("parseDolares reads the oficial fecha valor and the paralelo", () => {
  const d = R.parseDolares(DOLARES);
  assert.deepEqual(d.oficial, { fecha: "2026-11-20", value: 918.7662 });
  assert.equal(d.paralelo.value, 1089.26138);
  assert.equal(d.paralelo.at, Date.parse("2026-11-22T12:01:18.557Z"));
});

test("pickBcv splits published (future fecha valor) from vigente", () => {
  const entries = R.parseHistoricos(HIST);
  const sunday = R.pickBcv(entries, "2026-11-22");
  assert.equal(sunday.published.fecha, "2026-11-24");
  assert.equal(sunday.vigente.fecha, "2026-11-20");
  assert.equal(sunday.same, false);

  // El martes 24 la publicada pasa a ser la vigente: una sola fila, aun sin red.
  const tuesday = R.pickBcv(entries, "2026-11-24");
  assert.equal(tuesday.vigente.value, 919.8227);
  assert.equal(tuesday.same, true);
});

test("pickBcv ignores implausible far-future dates and handles no data", () => {
  const entries = [{ fecha: "2026-11-20", value: 918.7662 }, { fecha: "2027-11-20", value: 1 }];
  const p = R.pickBcv(entries, "2026-11-22");
  assert.equal(p.published.fecha, "2026-11-20");
  assert.equal(p.same, true);
  assert.deepEqual(R.pickBcv([], "2026-11-22"), { published: null, vigente: null, same: true });
});

test("isStale flags a published rate older than a long weekend", () => {
  assert.equal(R.isStale({ fecha: "2026-11-20" }, "2026-11-23"), false);
  assert.equal(R.isStale({ fecha: "2026-11-16" }, "2026-11-23"), true);
  assert.equal(R.isStale(null, "2026-11-23"), true);
});

test("BCV manual override survives refreshes until a newer rate is published", () => {
  let ov = R.setBcvOverride(null, "2026-11-24", "2026-11-24", 920);
  ov = R.setBcvOverride(ov, "2026-11-24", "2026-11-20", 918.8);
  assert.equal(R.bcvOverrideFor(ov, "2026-11-24"), 920);
  assert.equal(R.bcvOverrideFor(ov, "2026-11-20"), 918.8);

  // Un refresco que trae la misma publicada no lo toca.
  assert.deepEqual(R.reconcileBcvOverride(ov, "2026-11-24"), { override: ov, dropped: false });

  // El BCV publica la del miércoles 25: se descarta y se avisa.
  assert.deepEqual(R.reconcileBcvOverride(ov, "2026-11-25"), { override: null, dropped: true });

  // Restablecer una fila deja la otra.
  const one = R.clearBcvOverride(ov, "2026-11-24");
  assert.equal(R.bcvOverrideFor(one, "2026-11-24"), null);
  assert.equal(R.bcvOverrideFor(one, "2026-11-20"), 918.8);
  assert.equal(R.clearBcvOverride(one, "2026-11-20"), null);
});

test("BCV override made before any data is dropped once real data arrives", () => {
  const ov = R.setBcvOverride(null, null, null, 900);
  assert.equal(R.bcvOverrideFor(ov, null), 900);
  assert.equal(R.reconcileBcvOverride(ov, null).override, ov);
  assert.equal(R.reconcileBcvOverride(ov, "2026-11-24").dropped, true);
  assert.equal(R.reconcileBcvOverride(null, "2026-11-24").dropped, false);
});

test("fmtRate shows up to 4 decimals without trailing zeros", () => {
  assert.equal(R.fmtRate(919.8227), "919.8227");
  assert.equal(R.fmtRate(1011.17949056), "1011.1795");
  assert.equal(R.fmtRate(885.6), "885.6");
  assert.equal(R.fmtRate(0), "");
});
