"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const CE = require("../calc.js");

test("groupNumber leaves the number as-is: no thousands separator, . stays as the decimal point", () => {
  assert.equal(CE.groupNumber("1234567"), "1234567");
  assert.equal(CE.groupNumber("1234.5"), "1234.5");
  assert.equal(CE.groupNumber("-1234"), "-1234");
  assert.equal(CE.groupNumber(""), "");
});

test("parseRate reads plain dot-decimal numbers", () => {
  assert.equal(CE.parseRate("771.07"), 771.07);
  assert.equal(CE.parseRate("1234.56"), 1234.56);
  assert.equal(CE.parseRate("771,07"), 771.07); // legacy comma-decimal values still parse
  assert.equal(CE.parseRate("abc"), 0);
  assert.equal(CE.parseRate("-5"), 0);
});

test("evalExpr respects operator precedence and parens", () => {
  assert.equal(CE.evalExpr(["2", "+", "3", "×", "4"]), 14);
  assert.equal(CE.evalExpr(["(", "2", "+", "3", ")", "×", "4"]), 20);
  assert.equal(CE.evalExpr(["10", "÷", "0"]), 0); // division by zero guarded to 0
  assert.equal(CE.evalExpr(["−", "5", "+", "2"]), -3);
});

test("trimResult trims trailing zeros and caps precision", () => {
  assert.equal(CE.trimResult(3), "3");
  assert.equal(CE.trimResult(3.5), "3.5");
  assert.equal(CE.trimResult(0.1 + 0.2), "0.3");
  assert.equal(CE.trimResult(NaN), "0");
});

test("engine: basic key sequence 12 + 8 =", () => {
  const e = CE.createEngine();
  e.pressDigit("1"); e.pressDigit("2");
  e.pressOperator("+");
  e.pressDigit("8");
  e.equals();
  assert.equal(e.currentNumber, "20");
  assert.equal(e.justEqualed, true);
  assert.deepEqual(e.history[e.history.length - 1], { expr: "12+8", result: "20" });
});

test("engine: pressing an operator twice replaces it, doesn't stack", () => {
  const e = CE.createEngine();
  e.pressDigit("5");
  e.pressOperator("+");
  e.pressOperator("×");
  e.pressDigit("3");
  e.equals();
  assert.equal(e.currentNumber, "15");
});

test("engine: typing a digit right after '=' starts a fresh expression", () => {
  const e = CE.createEngine();
  e.pressDigit("2"); e.pressOperator("+"); e.pressDigit("2"); e.equals();
  assert.equal(e.currentNumber, "4");
  e.pressDigit("9");
  assert.equal(e.justEqualed, false);
  assert.equal(e.currentNumber, "9");
});

test("engine: backspace removes last digit, then last token", () => {
  const e = CE.createEngine();
  e.pressDigit("1"); e.pressDigit("2"); e.pressOperator("+");
  e.backspace(); // removes the '+' token since currentNumber is empty
  assert.deepEqual(e.tokens, ["12"]);
  assert.equal(e.currentNumber, "");
  e.backspace(); // now pops the '12' token itself
  assert.deepEqual(e.tokens, []);
});

test("engine: percent divides current number by 100", () => {
  const e = CE.createEngine();
  e.pressDigit("5"); e.pressDigit("0");
  e.percent();
  assert.equal(e.currentNumber, "0.5");
});

test("engine: currentValue reflects the active operand for live conversion", () => {
  const e = CE.createEngine();
  e.pressDigit("1"); e.pressDigit("5"); e.pressDigit("0");
  assert.equal(e.currentValue(), 150);
  e.pressOperator("+");
  assert.equal(e.currentValue(), 150); // still reads last operand once currentNumber clears
});

test("engine: parens with implicit multiplication (5( -> 5×()", () => {
  const e = CE.createEngine();
  e.pressDigit("5");
  e.pressParen("(");
  e.pressDigit("2");
  e.pressParen(")");
  e.equals();
  assert.equal(e.currentNumber, "10");
});
