#!/usr/bin/env node
/* Smoke tests for the Worker — override generation, sanitization, and routing
 (with a stubbed KV). Run with `node scripts/test.mjs`. */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const raw = readFileSync(new URL("../worker/src/index.js", import.meta.url), "utf8")
	.replace(/^import THEME from "\.\/theme\.css";$/m, 'const THEME = "/*THEME*/";')
	.replace(/^import PANEL from "\.\/panel\.html";$/m, 'const PANEL = "<html>panel</html>";');
const mod = join(mkdtempSync(join(tmpdir(), "misono-")), "index.mjs");
writeFileSync(mod, raw);
const m = await import(mod);
const { generateOverrides, sanitizeConfig, DEFAULT_CONFIG, DEFAULT_SLOTS } = m;
const worker = m.default;
const cfg = (over = {}) => ({ ...structuredClone(DEFAULT_CONFIG), ...over });

let out;

// defaults → feel vars present, no MOTD/accent/theme blocks
out = generateOverrides(cfg());
assert.ok(out.includes("--SNDL-Animation_Multiplier: 1;"));
assert.ok(!out.includes("--Misono-MOTD"));
assert.ok(!out.includes("--Misono-Accent"));
assert.ok(!out.includes(".theme-dark"));

// MOTD escaping
out = generateOverrides(cfg({ motd: 'hi "there"\nrow2' }));
assert.ok(out.includes('--Misono-MOTD: "hi \\"there\\"\\a row2";'));

// hide toggles win over text
out = generateOverrides(cfg({ motd: "x", statusbar: "y", toggles: { hideNotification: true, hideStatusbar: true } }));
assert.ok(out.includes("--Misono-MOTD: none;") && out.includes("--Misono-Statusbar: none;"));

// accent from hex / #rgb / triplet all normalize to "r, g, b" (via sanitize)
for (const a of ["#ff82c8", "255,130,200", "255, 130, 200"]) {
	out = generateOverrides(sanitizeConfig({ accent: a }));
	assert.ok(out.includes("--Misono-Accent: 255, 130, 200;"), `accent ${a}`);
	assert.ok(out.includes("--brand-500: rgba(255, 130, 200, var(--SNDL-UI_Opacity_Solid));"));
	assert.ok(out.includes("--text-link: rgb(255, 130, 200);"));
}
assert.equal(sanitizeConfig({ accent: "#f0a" }).accent, "255, 0, 170"); // shorthand hex
// bad accent ignored
assert.equal(sanitizeConfig({ accent: "not-a-color" }).accent, null);
out = generateOverrides(cfg({ accent: null }));
assert.ok(!out.includes("--Misono-Accent"));

// font passthrough, unsafe font rejected by sanitize
out = generateOverrides(cfg({ font: '"Comic Sans MS", cursive' }));
assert.ok(out.includes('--Misono-Font: "Comic Sans MS", cursive;'));
assert.equal(sanitizeConfig({ font: "x; } body{display:none" }).font, null);

// background with dim composes overlay + image
out = generateOverrides(cfg({ background: "https://x/y.png", backgroundDim: 0.4 }));
assert.ok(out.includes('--Misono-Background: linear-gradient(rgba(0,0,0,0.4),rgba(0,0,0,0.4)), url("https://x/y.png") center / cover fixed;'));

// slot remap emits dark + light with right stops
out = generateOverrides(cfg({ slots: { ...DEFAULT_SLOTS, Green: "mika" } }));
assert.ok(out.includes("--SNDL-Green_Primary: var(--Mika-Moon);"));
assert.ok(/\.theme-light \{[^}]*--SNDL-Green_Primary: var\(--Mika-Sun\);/s.test(out));

// custom CSS appended, style/script tags stripped by sanitize
out = generateOverrides(sanitizeConfig({ customCSS: "a{color:red} </style><script>evil" }));
assert.ok(out.includes("a{color:red}") && !out.includes("</style>") && !out.includes("<script>"));

// ---- routing with stubbed KV ----
const store = new Map();
const env = {
	MISONO_TOKEN: "sekrit",
	MISONO_KV: {
		get: async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null),
		put: async (k, v) => void store.set(k, v),
	},
};
const req = (p, o) => worker.fetch(new Request("https://x" + p, o), env);

assert.equal((await req("/theme.css")).status, 200);
assert.equal((await req("/api/config", { method: "PUT", body: "{}" })).status, 401);
let r = await req("/api/config", {
	method: "PUT",
	headers: { Authorization: "Bearer sekrit" },
	body: JSON.stringify({ accent: "#96ff78", slots: { Green: "mika" }, customVars: { "--Evil": "x};}" } }),
});
assert.equal(r.status, 200);
let saved = await r.json();
assert.equal(saved.accent, "150, 255, 120");
assert.deepEqual(saved.customVars, {}); // injection rejected
out = await (await req("/theme.css")).text();
assert.ok(out.includes("--Misono-Accent: 150, 255, 120;") && out.includes("var(--Mika-Moon)"));
assert.equal((await req("/")).status, 200);
assert.equal((await req("/nope")).status, 404);

// ---- KV-optional path: no binding → serves theme, GET reports save disabled, PUT 503 ----
const envNoKv = {};
const rn = (p, o) => worker.fetch(new Request("https://x" + p, o), envNoKv);
assert.equal((await rn("/theme.css")).status, 200);
const gc = await (await rn("/api/config")).json();
assert.equal(gc._saveEnabled, false);
assert.equal((await rn("/api/config", { method: "PUT", headers: { Authorization: "Bearer sekrit" }, body: "{}" })).status, 503);

console.log("all tests passed");
