(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CalcEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var OPS = ["+", "−", "×", "÷"]; // + − × ÷

  function isOperator(t) { return OPS.indexOf(t) !== -1; }
  function isNumberToken(t) { return t !== undefined && t !== null && !isOperator(t) && t !== "(" && t !== ")"; }

  function countOpen(toks) {
    var c = 0;
    for (var i = 0; i < toks.length; i++) { if (toks[i] === "(") c++; else if (toks[i] === ")") c--; }
    return c;
  }

  function groupNumber(str) {
    if (str === "") return "";
    var neg = str.startsWith("-");
    if (neg) str = str.slice(1);
    var parts = str.split(".");
    var intPart = parts[0] === "" ? "0" : parts[0];
    intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    var out = intPart;
    if (parts.length > 1) out += "," + parts[1];
    return (neg ? "-" : "") + out;
  }

  function displayToken(t) {
    return (isOperator(t) || t === "(" || t === ")") ? t : groupNumber(t);
  }

  function evalExpr(toks) {
    var pos = 0;
    function factor() {
      var t = toks[pos];
      if (t === "(") { pos++; var v = expr(); if (toks[pos] === ")") pos++; return v; }
      if (t === "−") { pos++; return -factor(); }
      pos++;
      return parseFloat(t);
    }
    function term() {
      var v = factor();
      while (toks[pos] === "×" || toks[pos] === "÷") {
        var op = toks[pos]; pos++;
        var rhs = factor();
        v = op === "×" ? v * rhs : (rhs === 0 ? 0 : v / rhs);
      }
      return v;
    }
    function expr() {
      var v = term();
      while (toks[pos] === "+" || toks[pos] === "−") {
        var op = toks[pos]; pos++;
        var rhs = term();
        v = op === "+" ? v + rhs : v - rhs;
      }
      return v;
    }
    return expr();
  }

  function trimResult(n) {
    if (!isFinite(n)) return "0";
    var s = n.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
    if (s.length > 14) s = parseFloat(n.toPrecision(10)).toString();
    return s;
  }

  function parseRate(str) {
    var n = parseFloat(String(str).replace(/\./g, "").replace(",", "."));
    return isFinite(n) && n > 0 ? n : 0;
  }

  function fmtVES(n) {
    return "Bs " + n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtUSD(n) {
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function createEngine() {
    var tokens = [];
    var currentNumber = "";
    var justEqualed = false;
    var history = []; // {expr, result}

    function liveExprString() {
      var parts = tokens.map(displayToken);
      if (currentNumber !== "") parts.push(groupNumber(currentNumber));
      var s = parts.join("");
      return s === "" ? "0" : s;
    }

    function pressDigit(d) {
      if (justEqualed) {
        tokens = [];
        currentNumber = d === "." ? "0." : d;
        justEqualed = false;
        return;
      }
      if (currentNumber === "0" && d !== ".") { currentNumber = d; }
      else if (d === "." && currentNumber.includes(".")) { /* ignore */ }
      else if (d === "." && currentNumber === "") { currentNumber = "0."; }
      else {
        if (currentNumber.replace(/[.-]/g, "").length >= 14) return;
        currentNumber += d;
      }
    }

    function backspace() {
      if (justEqualed) {
        tokens = []; currentNumber = ""; justEqualed = false; return;
      }
      if (currentNumber !== "") {
        currentNumber = currentNumber.length > 1 ? currentNumber.slice(0, -1) : "";
      } else if (tokens.length) {
        tokens.pop();
      }
    }

    function percent() {
      if (currentNumber === "") return;
      var n = parseFloat(currentNumber) || 0;
      currentNumber = String(n / 100);
    }

    function clearAll() {
      tokens = []; currentNumber = ""; justEqualed = false;
    }

    function pressOperator(op) {
      if (justEqualed) {
        tokens = [currentNumber];
        currentNumber = "";
        justEqualed = false;
      }
      if (currentNumber !== "") {
        tokens.push(currentNumber);
        currentNumber = "";
      }
      if (tokens.length === 0) return;
      var last = tokens[tokens.length - 1];
      if (isOperator(last)) {
        tokens[tokens.length - 1] = op;
      } else if (last === "(") {
        return; // no operand yet after "("
      } else {
        tokens.push(op);
      }
    }

    function pressParen(which) {
      if (justEqualed) {
        if (which === "(") { tokens = []; currentNumber = ""; justEqualed = false; }
        else { return; }
      }
      if (which === ")") {
        var openNow = countOpen(tokens);
        var last = currentNumber !== "" ? null : (tokens.length ? tokens[tokens.length - 1] : null);
        if (currentNumber === "" && (last === null || isOperator(last) || last === "(")) return;
        if (openNow <= 0) return;
      }
      if (currentNumber !== "") {
        tokens.push(currentNumber);
        currentNumber = "";
        if (which === "(") tokens.push("×"); // implicit multiplication: 5( -> 5×(
      } else if (which === "(" && tokens.length) {
        var lastTok = tokens[tokens.length - 1];
        if (isNumberToken(lastTok) || lastTok === ")") { tokens.push("×"); }
      }
      tokens.push(which);
    }

    function pushHistory(expr, resultStr) {
      history.push({ expr: expr, result: resultStr });
      if (history.length > 20) history.shift();
    }

    function equals() {
      var toks = tokens.slice();
      if (currentNumber !== "") { toks.push(currentNumber); }
      else if (toks.length && isOperator(toks[toks.length - 1])) { toks.pop(); }
      var openCount = countOpen(toks);
      for (var i = 0; i < openCount; i++) toks.push(")");
      if (toks.length < 1) return;

      var exprDisplay = toks.map(displayToken).join("");
      var resultNum;
      try { resultNum = evalExpr(toks); } catch (e) { resultNum = NaN; }
      var resultVal = trimResult(resultNum);
      pushHistory(exprDisplay, groupNumber(resultVal));

      tokens = [];
      currentNumber = resultVal;
      justEqualed = true;
    }

    function currentValue() {
      if (currentNumber !== "") return parseFloat(currentNumber) || 0;
      for (var i = tokens.length - 1; i >= 0; i--) {
        if (isNumberToken(tokens[i])) return parseFloat(tokens[i]) || 0;
      }
      return 0;
    }

    return {
      pressDigit: pressDigit,
      backspace: backspace,
      percent: percent,
      clearAll: clearAll,
      pressOperator: pressOperator,
      pressParen: pressParen,
      equals: equals,
      currentValue: currentValue,
      liveExprString: liveExprString,
      get tokens() { return tokens.slice(); },
      get currentNumber() { return currentNumber; },
      get justEqualed() { return justEqualed; },
      get history() { return history.slice(); }
    };
  }

  return {
    OPS: OPS,
    isOperator: isOperator,
    isNumberToken: isNumberToken,
    countOpen: countOpen,
    groupNumber: groupNumber,
    displayToken: displayToken,
    evalExpr: evalExpr,
    trimResult: trimResult,
    parseRate: parseRate,
    fmtVES: fmtVES,
    fmtUSD: fmtUSD,
    createEngine: createEngine
  };
});
