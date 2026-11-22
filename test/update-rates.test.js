"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const U = require("../scripts/update-rates.js");

const HTML = fs.readFileSync(path.join(__dirname, "fixtures", "bcv-2026-11-22.html"), "utf8");

test("parseVeNumber reads BCV's comma-decimal, dot-thousands format", () => {
  assert.equal(U.parseVeNumber("919,82270000"), 919.8227);
  assert.equal(U.parseVeNumber(" 1.011,17949056"), 1011.17949056);
  assert.equal(U.parseVeNumber("abc"), null);
});

test("parseBcvHtml reads the USD rate (not the EUR one) and its fecha valor", () => {
  assert.deepEqual(U.parseBcvHtml(HTML), { fecha: "2026-11-24", value: 919.8227 });
  assert.equal(U.parseBcvHtml("<html>mantenimiento</html>"), null);
});

test("validateBcv rejects implausible readings", () => {
  const history = [{ fecha: "2026-11-20", value: 918.7662 }];
  assert.equal(U.validateBcv({ fecha: "2026-11-24", value: 919.8227 }, history, "2026-11-22"), null);
  assert.match(U.validateBcv({ fecha: "2026-11-24", value: 1011.18 * 1.3 }, history, "2026-11-22"), /salto/);
  assert.match(U.validateBcv({ fecha: "2026-10-01", value: 900 }, history, "2026-11-22"), /vieja/);
  assert.match(U.validateBcv({ fecha: "2027-01-01", value: 920 }, history, "2026-11-22"), /futuro/);
  assert.match(U.validateBcv(null, history, "2026-11-22"), /no se encontró/);
});

test("mergeHistory only reports a change for a new fecha or a corrected value", () => {
  const history = [{ fecha: "2026-11-20", value: 918.7662 }];
  const a = U.mergeHistory(history, { fecha: "2026-11-24", value: 919.8227 });
  assert.equal(a.changed, true);
  assert.deepEqual(a.history.map((e) => e.fecha), ["2026-11-20", "2026-11-24"]);
  assert.equal(U.mergeHistory(a.history, { fecha: "2026-11-24", value: 919.8227 }).changed, false);
  const fixed = U.mergeHistory(a.history, { fecha: "2026-11-24", value: 919.9 });
  assert.equal(fixed.changed, true);
  assert.equal(fixed.history[1].value, 919.9);
});

test("p2pFromBinance averages the buy and sell medians", () => {
  const ads = (prices) => ({ data: prices.map((price) => ({ adv: { price } })) });
  const p = U.p2pFromBinance(ads(["1090", "1093", "1094"]), ads(["1100", "1094", "1092"]));
  assert.deepEqual(p, { buy: 1093, sell: 1094, value: 1093.5 });
  assert.equal(U.p2pFromBinance(ads([]), null), null);
  assert.equal(U.p2pFromBinance(ads(["1090"]), null).value, 1090);
});
