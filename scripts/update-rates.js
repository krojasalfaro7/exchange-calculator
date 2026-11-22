#!/usr/bin/env node
// Lo corre la Action (deploy-pages.yml) antes de cada deploy y en horario:
//  1. Lee la tasa USD y su "Fecha valor" directamente de https://www.bcv.org.ve/.
//  2. La valida y la agrega a data/bcv.json (historial versionado: el bot commitea solo si cambia).
//  3. Consulta Binance P2P (desde el servidor no hay problema de CORS).
//  4. Escribe rates.json (no versionado), que la app lee del mismo dominio.
// Nunca falla el job por una fuente caída: deja avisos (::warning::) y conserva lo último bueno.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const tls = require("node:tls");
const R = require("../rates.js");

const ROOT = path.join(__dirname, "..");
const HISTORY_FILE = path.join(ROOT, "data", "bcv.json");
const OUT_FILE = path.join(ROOT, "rates.json");
const BCV_URL = "https://www.bcv.org.ve/";
const BINANCE_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const USER_AGENT = "Mozilla/5.0 (compatible; calc-rates-bot/1.0)";
const MAX_JUMP = 0.25; // una tasa que salta más de 25% contra la anterior es un error de lectura

// bcv.org.ve envía un intermedio equivocado en su cadena TLS. En vez de desactivar la
// verificación, se agrega el intermedio correcto (el que indica el AIA de su certificado),
// emitido por Sectigo Public Server Authentication Root R46; vence en 2036.
const BCV_CA = [...tls.rootCertificates, fs.readFileSync(path.join(__dirname, "certs", "sectigo-public-server-auth-ca-ov-r36.pem"), "utf8")];

// ---------- Lógica pura (la prueban los tests) ----------

// "919,82270000" / "1.011,17949056" -> número
function parseVeNumber(str) {
  const n = parseFloat(String(str).trim().replace(/\./g, "").replace(",", "."));
  return isFinite(n) && n > 0 ? n : null;
}

// HTML de bcv.org.ve -> {fecha, value} del USD, o null si la página cambió de forma.
function parseBcvHtml(html) {
  const usd = /id="dolar"[\s\S]{0,1500}?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/.exec(html);
  const fecha = /Fecha\s+Valor:[\s\S]{0,300}?content="(\d{4}-\d{2}-\d{2})T/.exec(html);
  if (!usd || !fecha) return null;
  const value = parseVeNumber(usd[1]);
  return value ? { fecha: fecha[1], value } : null;
}

// Devuelve el motivo para rechazar la lectura, o null si es plausible.
function validateBcv(entry, history, today) {
  if (!entry) return "no se encontró la tasa USD o la fecha valor en la página";
  const age = R.daysBetween(entry.fecha, today);
  if (age > 10) return `fecha valor ${entry.fecha} demasiado vieja`;
  if (age < -7) return `fecha valor ${entry.fecha} demasiado en el futuro`;
  const prev = history.filter((e) => e.fecha !== entry.fecha).slice(-1)[0];
  if (prev && Math.abs(entry.value / prev.value - 1) > MAX_JUMP) {
    return `salto sospechoso: ${prev.value} (${prev.fecha}) -> ${entry.value} (${entry.fecha})`;
  }
  return null;
}

// Agrega/actualiza la entrada; changed = hay algo nuevo que commitear.
function mergeHistory(history, entry) {
  const old = history.find((e) => e.fecha === entry.fecha);
  if (old && old.value === entry.value) return { history, changed: false };
  const next = history.filter((e) => e.fecha !== entry.fecha).concat([{ fecha: entry.fecha, value: entry.value }]);
  return { history: R.normalizeEntries(next), changed: true }; // normalizeEntries deja las 15 más recientes
}

function median(nums) {
  const s = nums.filter((n) => isFinite(n) && n > 0).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

// Respuestas de Binance (pedido BUY = anuncios de quien vende USDT, y SELL = de quien compra)
// -> {buy, sell, value}: value es el promedio de ambas medianas.
function p2pFromBinance(buyJson, sellJson) {
  const prices = (j) => ((j && j.data) || []).map((x) => parseFloat(x && x.adv && x.adv.price));
  const buy = median(prices(buyJson));
  const sell = median(prices(sellJson));
  const sides = [buy, sell].filter((n) => n !== null);
  if (!sides.length) return null;
  const value = Math.round((sides.reduce((a, b) => a + b, 0) / sides.length) * 100) / 100;
  return { buy, sell, value };
}

// ---------- Red ----------

function httpsGet(url, opts) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { ...opts, headers: { "User-Agent": USER_AGENT, "Accept-Language": "es" }, timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      res.setEncoding("utf8");
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve(body));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function withRetries(fn, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { err = e; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); }
  }
  throw err;
}

async function binanceSide(tradeType) {
  const res = await fetch(BINANCE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ page: 1, rows: 10, asset: "USDT", fiat: "VES", tradeType, payTypes: [], publisherType: null }),
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------- Main ----------

function warn(msg) { console.log(`::warning::${msg}`); }

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}

function setOutput(key, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

async function main() {
  const now = Date.now();
  const today = R.caracasToday(now);
  const stored = readJson(HISTORY_FILE, { entries: [] });
  let history = R.normalizeEntries(stored.entries || []);
  let bcvOk = false;
  let changed = false;

  try {
    const html = await withRetries(() => httpsGet(BCV_URL, { ca: BCV_CA }));
    const entry = parseBcvHtml(html);
    const problem = validateBcv(entry, history, today);
    if (problem) {
      warn(`BCV: lectura descartada (${problem})`);
    } else {
      bcvOk = true;
      ({ history, changed } = mergeHistory(history, entry));
      console.log(`BCV: ${entry.value} fecha valor ${entry.fecha}${changed ? " (nueva)" : " (sin cambios)"}`);
      if (changed) setOutput("bcv_summary", `${entry.value} fecha valor ${entry.fecha}`);
    }
  } catch (e) {
    warn(`BCV: no se pudo leer ${BCV_URL} (${e.message})`);
  }

  if (changed) {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({ source: BCV_URL, entries: history }, null, 2) + "\n");
  }
  setOutput("bcv_changed", changed ? "true" : "false");

  let p2p = null;
  try {
    const [buy, sell] = await Promise.all([withRetries(() => binanceSide("BUY")), withRetries(() => binanceSide("SELL"))]);
    p2p = p2pFromBinance(buy, sell);
    if (p2p) { p2p.at = now; p2p.source = "binance"; console.log(`Binance P2P: ${p2p.value} (compra ${p2p.buy}, venta ${p2p.sell})`); }
    else warn("Binance P2P: respuesta sin anuncios");
  } catch (e) {
    warn(`Binance P2P: no se pudo consultar (${e.message})`);
  }

  const out = {
    generatedAt: now,
    bcv: { source: BCV_URL, ok: bcvOk, checkedAt: now, entries: history },
    p2p
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out) + "\n");
}

if (require.main === module) {
  main().catch((e) => { warn(`update-rates falló: ${e.stack || e}`); process.exitCode = 0; });
}

module.exports = { parseVeNumber, parseBcvHtml, validateBcv, mergeHistory, p2pFromBinance };
