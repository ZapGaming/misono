#!/usr/bin/env node
/* Misono build script — compiles src/ into dist/misono.theme.css.
 Zero dependencies: resolves @import url("...") statements in src/misono.css
 recursively, appends the dynamic layer, and prepends the theme header. */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

const HEADER = `/**
 * @name Misono
 * @author Ascellayn
 * @description The Sirio Network's dynamic Discord theme — successor to Flashcord. Configurable live via the Misono Worker.
 * @version ${new Date().toISOString().slice(0, 10).replace(/-/g, "")}
 * @source https://github.com/ZapGaming/misono
 *
 * Misono (CSS) © The Sirio Network (2026) // TSN License 2.1 Strict
 * Misono Worshipper © The Sirio Network (2026) // All Rights Reserved
 * Do not circumvent, modify, or redistribute this compiled Misono CSS file.
 * Only modify the files provided on the GitHub Repository.
*/\n\n`;

const FOOTER = `\n\n/*\nFROM ASCELLAYN,\nWITH LOVE\n*/\n`;

const seen = new Set();

function inline(file) {
	const path = resolve(file);
	if (seen.has(path)) return "";
	seen.add(path);
	const css = readFileSync(path, "utf8");
	return css.replace(/@import url\("([^"]+)"\);?/g, (_, rel) =>
		inline(join(dirname(path), rel)),
	);
}

const compiled =
	HEADER +
	inline(join(SRC, "misono.css")) +
	"\n" +
	inline(join(SRC, "dynamic.css")) +
	FOOTER;

mkdirSync(DIST, { recursive: true });
writeFileSync(join(DIST, "misono.theme.css"), compiled);
// The Worker imports the compiled theme as text and appends live overrides.
writeFileSync(join(ROOT, "worker", "src", "theme.css"), compiled);
console.log(
	`built dist/misono.theme.css (${(compiled.length / 1024).toFixed(1)} KiB, ${seen.size} source files)`,
);
