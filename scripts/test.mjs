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

// base surface color repaints SNC in BOTH theme blocks, with auto-contrast text
out = generateOverrides(sanitizeConfig({ surface: "#1a0f26" }));
assert.ok(out.includes("--SNC-Primary: 26, 15, 38;"));
assert.ok(/\.theme-dark \{[^}]*--SNC-Primary: 26, 15, 38;/s.test(out));
assert.ok(/\.theme-light \{[^}]*--SNC-Primary: 26, 15, 38;/s.test(out));
assert.ok(out.includes("--SNC-Text: rgb(231, 227, 233);")); // dark surface → light text
// light surface → dark text
out = generateOverrides(sanitizeConfig({ surface: "#eeeeee" }));
assert.ok(out.includes("--SNC-Text: rgb(26, 20, 30);"));
// explicit text color overrides auto
out = generateOverrides(sanitizeConfig({ surface: "#1a0f26", textColor: "#00ff00" }));
assert.ok(out.includes("--SNC-Text: rgb(0, 255, 0);"));
// no surface → SNC untouched
assert.ok(!generateOverrides(cfg()).includes("--SNC-Primary:"));

// slot remap emits dark + light with right stops
out = generateOverrides(cfg({ slots: { ...DEFAULT_SLOTS, Green: "mika" } }));
assert.ok(out.includes("--SNDL-Green_Primary: var(--Mika-Moon);"));
assert.ok(/\.theme-light \{[^}]*--SNDL-Green_Primary: var\(--Mika-Sun\);/s.test(out));

// custom CSS appended, style/script tags stripped by sanitize
out = generateOverrides(sanitizeConfig({ customCSS: "a{color:red} </style><script>evil" }));
assert.ok(out.includes("a{color:red}") && !out.includes("</style>") && !out.includes("<script>"));

// zoom / letter-spacing only emitted when non-default; border/outline always in feel
out = generateOverrides(cfg());
assert.ok(!out.includes("--Misono-Zoom") && !out.includes("--Misono-Letter_Spacing") && !out.includes("--Misono-Filter"));
assert.ok(out.includes("--SNDL-UI_Border-Size: 4px;") && out.includes("--SNDL-UI_Outline-Size: 1px;"));
out = generateOverrides(sanitizeConfig({ zoom: 1.2, letterSpacing: 0.05 }));
assert.ok(out.includes("--Misono-Zoom: 1.2;") && out.includes("--Misono-Letter_Spacing: 0.05em;"));

// effects → filter; reduce-motion collapses timing
out = generateOverrides(sanitizeConfig({ effects: { saturation: 1.4, contrast: 1.1, brightness: 0.9 } }));
assert.ok(out.includes("--Misono-Filter: saturate(1.4) contrast(1.1) brightness(0.9);"));
out = generateOverrides(sanitizeConfig({ effects: { reduceMotion: true } }));
assert.ok(out.includes("--SNDL-Animation_Multiplier: 0.001;") && out.includes("--SNDL-Transition_Multiplier: 0.001;"));

// avatar shape
assert.ok(!generateOverrides(cfg()).includes("--SNDL-UI_Border-Radius_Circle"));
assert.ok(generateOverrides(sanitizeConfig({ avatarShape: "square" })).includes("--SNDL-UI_Border-Radius_Circle: 0px;"));
assert.ok(generateOverrides(sanitizeConfig({ avatarShape: "rounded" })).includes("--SNDL-UI_Border-Radius_Circle: 12px;"));

// status colors emit multiple vars from one triplet
out = generateOverrides(sanitizeConfig({ status: { online: "#00ff00", dnd: "255,0,0" } }));
assert.ok(out.includes("--status-online: rgba(0, 255, 0, var(--SNDL-UI_Opacity_Solid));"));
assert.ok(out.includes("--icon-status-online: rgba(0, 255, 0, var(--SNDL-UI_Opacity_Solid));"));
assert.ok(out.includes("--icon-status-dnd: rgba(255, 0, 0, var(--SNDL-UI_Opacity_Solid));"));

// gradient background wins over image, with dim overlay
out = generateOverrides(sanitizeConfig({ background: "https://x/y.png", backgroundDim: 0.2, backgroundGradient: { enabled: true, from: "#000000", to: "#ffffff", angle: 90 } }));
assert.ok(out.includes("--Misono-Background: linear-gradient(rgba(0,0,0,0.2),rgba(0,0,0,0.2)), linear-gradient(90deg, rgb(0, 0, 0), rgb(255, 255, 255)) fixed;"));
// gradient ignored unless both colors valid
assert.equal(sanitizeConfig({ backgroundGradient: { enabled: true, from: "#000000" } }).backgroundGradient.enabled, false);

// custom scheme stops emitted only when a slot references "custom"
out = generateOverrides(sanitizeConfig({ slots: { ...DEFAULT_SLOTS, Pink: "custom" }, customScheme: { moon: "10,20,30" } }));
assert.ok(out.includes("--Custom-Moon: 10, 20, 30;"));
assert.ok(out.includes("--SNDL-Pink_Primary: var(--Custom-Moon);"));
assert.ok(!generateOverrides(sanitizeConfig({ customScheme: { moon: "10,20,30" } })).includes("--Custom-Moon"));

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
