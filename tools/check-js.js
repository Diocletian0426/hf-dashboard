// Syntax-checks all frontend JavaScript — both the standalone .js files and the
// <script> blocks embedded in each .html page (which `node --check` can't see).
// Run from the repo root:  node tools/check-js.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const dir = path.join(__dirname, "..", "frontend");
let failed = 0;

function checkSource(label, src) {
  try {
    new vm.Script(src, { filename: label });   // parse only, never executed
    console.log("OK   " + label);
  } catch (e) {
    failed++;
    console.log("FAIL " + label + " -> " + e.message);
  }
}

for (const f of fs.readdirSync(dir)) {
  const full = path.join(dir, f);
  if (f.endsWith(".js")) {
    checkSource(f, fs.readFileSync(full, "utf8"));
  } else if (f.endsWith(".html")) {
    const html = fs.readFileSync(full, "utf8");
    const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let m, i = 0;
    while ((m = re.exec(html)) !== null) {
      i++;
      checkSource(f + " <script #" + i + ">", m[1]);
    }
  }
}

process.exit(failed ? 1 : 0);
