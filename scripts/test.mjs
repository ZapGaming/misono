#!/usr/bin/env node
/* Smoke tests for the Worker's override generator — run with `node scripts/test.mjs`.
 Imports the pure functions from the Worker module (the css/html imports are
 wrangler-only, so we stub them via a loader-free trick: read + strip imports). */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const src = readFileSync(new URL("../worker/src/index.js", import.meta.url), "utf8")
	.replace(/^import THEME from "\.\/theme\.css";$/m, 'const THEME = "";')
	.replace(/^import PANEL from "\.\/panel\.html";$/m, 'const PANEL = "";');
const tmp = mkdtempSync(join(tmpdir(), "misono-"));
const mod = join(tmp, "index.mjs");
writeFileSync(mod, src);
const { generateOverrides, DEFAULT_CONFIG, DEFAULT_SLOTS } = await import(mod);

// defaults → no MOTD/background override, multipliers present
let css = generateOverrides(structuredClone(DEFAULT_CONFIG));
assert.ok(css.includes("--SNDL-Animation_Multiplier: 1;"));
assert.ok(!css.includes("--Misono-MOTD"));
assert.ok(!css.includes(".theme-dark"));

// MOTD with quotes/newlines is escaped into a valid CSS string
css = generateOverrides({
	...structuredClone(DEFAULT_CONFIG),
	motd: 'hello "world"\nline two',
});
assert.ok(css.includes('--Misono-MOTD: "hello \\"world\\"\\a line two";'));

// empty MOTD hides the notification
css = generateOverrides({ ...structuredClone(DEFAULT_CONFIG), motd: "" });
assert.ok(css.includes("--Misono-MOTD: none;"));

// slot remap emits dark+light blocks with the right stops
const cfg = structuredClone(DEFAULT_CONFIG);
cfg.slots.Green = "mika";
css = generateOverrides(cfg);
assert.ok(css.includes(".theme-dark"));
assert.ok(css.includes("--SNDL-Green_Primary: var(--Mika-Moon);"));
assert.ok(css.includes("--SNDL-GreenI_Primary: var(--Mika-Sun);"));
assert.ok(/\.theme-light \{[^}]*--SNDL-Green_Primary: var\(--Mika-Sun\);/s.test(css));

// default slots emit nothing extra
assert.equal(Object.keys(DEFAULT_SLOTS).length, 11);

// background url
css = generateOverrides({
	...structuredClone(DEFAULT_CONFIG),
	background: "https://example.com/bg.png",
});
assert.ok(css.includes('--Misono-Background: url("https://example.com/bg.png");'));

console.log("all tests passed");
