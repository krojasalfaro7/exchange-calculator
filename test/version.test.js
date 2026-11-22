"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("the update check reads the real APP_VERSION from index.html", () => {
  // Mismo patrón que checkLatestVersion en index.html: la primera coincidencia debe ser la declaración.
  const m = /APP_VERSION = "(\d+(?:\.\d+)+)"/.exec(html);
  assert.ok(m, "index.html debe declarar APP_VERSION = \"x.y.z\"");
  assert.equal(m[1], pkg.version, "APP_VERSION y package.json deben coincidir");
});
