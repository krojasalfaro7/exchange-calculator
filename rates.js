// Lógica de tasas sin DOM: interpretar las respuestas de las APIs, decidir qué
// tasa BCV está publicada y cuál vigente, y manejar los ajustes manuales.
// La usan index.html (window.Rates) y los tests (require("../rates.js")).
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Rates = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DAY_MS = 86400000;
  var CARACAS_OFFSET_MS = 4 * 3600000; // Venezuela: UTC-4 todo el año (sin horario de verano)
  var MAX_FUTURE_DAYS = 7;             // el BCV publica 1 día hábil adelante; más que esto es un dato raro
  var STALE_DAYS = 4;                  // fin de semana largo + feriado; más viejo que esto = sospechoso
  var KEEP_ENTRIES = 15;
  var FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
  var DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

  // ---------- Fechas (siempre "AAAA-MM-DD" en hora de Caracas) ----------

  function caracasToday(now) {
    var t = (now instanceof Date ? now.getTime() : (typeof now === "number" ? now : Date.now()));
    return new Date(t - CARACAS_OFFSET_MS).toISOString().slice(0, 10);
  }

  function fechaToUTC(fecha) {
    return Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10));
  }

  function daysBetween(a, b) { // b - a, en días
    return Math.round((fechaToUTC(b) - fechaToUTC(a)) / DAY_MS);
  }

  function addDays(fecha, n) {
    return new Date(fechaToUTC(fecha) + n * DAY_MS).toISOString().slice(0, 10);
  }

  // "2026-11-24" -> "mar 24"
  function fmtFecha(fecha) {
    if (!fecha || !FECHA_RE.test(fecha)) return "";
    var d = new Date(fechaToUTC(fecha));
    return DIAS[d.getUTCDay()] + " " + d.getUTCDate();
  }

  // ---------- Respuestas de ve.dolarapi.com ----------

  function validValue(v) {
    var n = typeof v === "string" ? parseFloat(v) : v;
    return typeof n === "number" && isFinite(n) && n > 0 ? n : null;
  }

  function cleanEntry(fecha, value) {
    var v = validValue(value);
    if (typeof fecha !== "string") return null;
    fecha = fecha.slice(0, 10);
    if (!FECHA_RE.test(fecha) || v === null) return null;
    return { fecha: fecha, value: v };
  }

  // Ordena por fecha, deja una entrada por fecha (la última gana) y solo las más recientes.
  function normalizeEntries(list) {
    var byFecha = {};
    (list || []).forEach(function (e) {
      var c = e && cleanEntry(e.fecha, e.value);
      if (c) byFecha[c.fecha] = c;
    });
    return Object.keys(byFecha).sort().map(function (k) { return byFecha[k]; }).slice(-KEEP_ENTRIES);
  }

  // /v1/historicos/dolares/oficial -> [{fecha, promedio}, ...] (fecha = fecha valor)
  function parseHistoricos(json) {
    if (!Array.isArray(json)) return [];
    return normalizeEntries(json.map(function (x) {
      return x && x.fuente === "oficial" ? { fecha: x.fecha, value: x.promedio } : null;
    }));
  }

  // Objeto de /v1/dolares/oficial (o un elemento de /v1/dolares). fechaActualizacion
  // viene como "2026-11-20T00:00:00-04:00": la parte de fecha ya es la fecha valor en Caracas.
  function parseOficial(obj) {
    if (!obj || obj.fuente !== "oficial") return null;
    return cleanEntry(obj.fechaActualizacion, obj.promedio);
  }

  // /v1/dolares -> {oficial, paralelo}
  function parseDolares(json) {
    var out = { oficial: null, paralelo: null };
    if (!Array.isArray(json)) return out;
    json.forEach(function (x) {
      if (!x) return;
      if (x.fuente === "oficial") out.oficial = parseOficial(x);
      if (x.fuente === "paralelo") {
        var v = validValue(x.promedio);
        var at = Date.parse(x.fechaActualizacion);
        if (v !== null) out.paralelo = { value: v, at: isFinite(at) ? at : null };
      }
    });
    return out;
  }

  // ---------- Publicada vs vigente ----------

  // published: la última que publicó el BCV (lo que muestra bcv.org.ve, puede tener fecha valor futura).
  // vigente: la última con fecha valor <= hoy (la que rige hoy).
  // same: son la misma, se muestra una sola fila.
  function pickBcv(entries, today) {
    var limit = addDays(today, MAX_FUTURE_DAYS);
    var ok = normalizeEntries(entries).filter(function (e) { return e.fecha <= limit; });
    if (!ok.length) return { published: null, vigente: null, same: true };
    var published = ok[ok.length - 1];
    var vigente = null;
    for (var i = ok.length - 1; i >= 0; i--) {
      if (ok[i].fecha <= today) { vigente = ok[i]; break; }
    }
    if (!vigente) vigente = published; // solo hay tasas futuras: no hay otra que mostrar
    return { published: published, vigente: vigente, same: published.fecha === vigente.fecha };
  }

  // La tasa publicada es sospechosamente vieja (dolarapi atrasado o sin datos nuevos).
  function isStale(published, today) {
    return !published || daysBetween(published.fecha, today) > STALE_DAYS;
  }

  // ---------- Ajustes manuales ----------
  // BCV: {pubFecha, values: {fechaValor: tasa}}. Se mantiene mientras el BCV no publique
  // una tasa con fecha valor más nueva que la publicada al momento del ajuste.
  // pubFecha = null cuando aún no hay datos del BCV (clave "_" para la fila sin fecha).

  function reconcileBcvOverride(ov, pubFecha) {
    if (!ov || !ov.values || !Object.keys(ov.values).length) return { override: null, dropped: false };
    if (ov.pubFecha === pubFecha) return { override: ov, dropped: false };
    return { override: null, dropped: true };
  }

  function setBcvOverride(ov, pubFecha, fecha, value) {
    var values = {};
    if (ov && ov.pubFecha === pubFecha && ov.values) {
      Object.keys(ov.values).forEach(function (k) { values[k] = ov.values[k]; });
    }
    values[fecha || "_"] = value;
    return { pubFecha: pubFecha, values: values };
  }

  function clearBcvOverride(ov, fecha) {
    if (!ov || !ov.values) return null;
    var values = {};
    Object.keys(ov.values).forEach(function (k) { if (k !== (fecha || "_")) values[k] = ov.values[k]; });
    return Object.keys(values).length ? { pubFecha: ov.pubFecha, values: values } : null;
  }

  function bcvOverrideFor(ov, fecha) {
    return ov && ov.values && Object.prototype.hasOwnProperty.call(ov.values, fecha || "_")
      ? ov.values[fecha || "_"] : null;
  }

  // Muestra la tasa con hasta 4 decimales, sin ceros de más (919.8227, 918.7662, 885.6).
  function fmtRate(n) {
    if (!(n > 0)) return "";
    return String(parseFloat(n.toFixed(4)));
  }

  return {
    caracasToday: caracasToday,
    daysBetween: daysBetween,
    addDays: addDays,
    fmtFecha: fmtFecha,
    normalizeEntries: normalizeEntries,
    parseHistoricos: parseHistoricos,
    parseOficial: parseOficial,
    parseDolares: parseDolares,
    pickBcv: pickBcv,
    isStale: isStale,
    reconcileBcvOverride: reconcileBcvOverride,
    setBcvOverride: setBcvOverride,
    clearBcvOverride: clearBcvOverride,
    bcvOverrideFor: bcvOverrideFor,
    fmtRate: fmtRate
  };
});
