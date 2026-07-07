/* Misono Worker — serves the theme, a live config API, and the control panel.
 Misono © The Sirio Network (2026) // TSN License 2.1 Strict

 Routes:
   GET  /            control panel
   GET  /theme.css   compiled theme + live overrides generated from KV config
   GET  /api/config  current config (JSON)
   PUT  /api/config  update config — requires `Authorization: Bearer <MISONO_TOKEN>`

 Deploys and serves the theme even before KV is bound; saving is disabled until
 both MISONO_KV and MISONO_TOKEN exist. */

import THEME from "./theme.css";
import PANEL from "./panel.html";

const CONFIG_KEY = "config";

export const SCHEMES = [
	"arellyan", "ascellyan", "sagittariian", "wakamo", "maple", "seia",
	"otogi", "glacier", "marine", "nebula", "mika",
];

export const DEFAULT_SLOTS = {
	Black: "arellyan", White: "ascellyan", Grey: "sagittariian",
	Red: "wakamo", Orange: "maple", Yellow: "seia", Green: "otogi",
	Cyan: "glacier", Blue: "marine", Purple: "nebula", Pink: "mika",
};

export const DEFAULT_CONFIG = {
	motd: null,          // string, "" to hide, null for theme default
	statusbar: null,     // string, "" to hide, null for theme default
	branch: null,        // override --Misono-Branch label
	background: null,    // https URL or null
	backgroundDim: 0,    // 0..1 dark overlay over the background image
	accent: null,        // "R, G, B" triplet or null (keep theme's cyan accent)
	font: null,          // font-family string, e.g. 'Comic Sans MS'
	multipliers: { animation: 1, transition: 1, blur: 1 },
	ui: {
		radius: 33,            // px
		padding: 8,            // px
		opacitySolid: 0.8,
		opacityFloating: 0.5,
		opacityBackground: 0.25,
		opacityHint: 0.1,
	},
	slots: { ...DEFAULT_SLOTS }, // SNDL color slot -> scheme
	toggles: {
		hideNotification: false,
		hideStatusbar: false,
	},
	customVars: {},              // extra --Var: value pairs, escape-checked
	customCSS: null,             // raw CSS appended to /theme.css (token-gated)
};

/* ---------- helpers ---------- */

const clamp = (n, lo, hi, fallback) => {
	const v = Number(n);
	return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
};

const cssString = (s) =>
	'"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\a ") + '"';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Accept "r,g,b" or "#rrggbb"/"#rgb"; return "r, g, b" or null.
function parseTriplet(v) {
	if (typeof v !== "string") return null;
	const s = v.trim();
	let m = s.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
	if (m) return [1, 2, 3].map((i) => parseInt(m[i], 16)).join(", ");
	m = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
	if (m) return [1, 2, 3].map((i) => parseInt(m[i] + m[i], 16)).join(", ");
	m = s.match(/^(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})$/);
	if (m) {
		const p = [1, 2, 3].map((i) => Math.min(255, parseInt(m[i], 10)));
		return p.join(", ");
	}
	return null;
}

// CSS font-family: letters, digits, spaces, comma, quotes, hyphen only.
const isSafeFont = (v) =>
	typeof v === "string" && v.length <= 128 && /^[\w \-,'"]+$/.test(v);

export function sanitizeConfig(raw) {
	const d = DEFAULT_CONFIG;
	const cfg = structuredClone(d);
	if (typeof raw !== "object" || raw === null) return cfg;

	if (typeof raw.motd === "string") cfg.motd = raw.motd.slice(0, 2000);
	if (typeof raw.statusbar === "string") cfg.statusbar = raw.statusbar.slice(0, 200);
	if (typeof raw.branch === "string") cfg.branch = raw.branch.slice(0, 64);
	if (typeof raw.background === "string" && /^https:\/\/[^"\\)]+$/.test(raw.background))
		cfg.background = raw.background.slice(0, 1024);
	cfg.backgroundDim = clamp(raw.backgroundDim, 0, 1, d.backgroundDim);
	cfg.accent = parseTriplet(raw.accent);
	if (isSafeFont(raw.font)) cfg.font = raw.font;

	const m = raw.multipliers ?? {};
	cfg.multipliers.animation = clamp(m.animation, 0, 10, d.multipliers.animation);
	cfg.multipliers.transition = clamp(m.transition, 0, 10, d.multipliers.transition);
	cfg.multipliers.blur = clamp(m.blur, 0, 10, d.multipliers.blur);

	const u = raw.ui ?? {};
	cfg.ui.radius = clamp(u.radius, 0, 64, d.ui.radius);
	cfg.ui.padding = clamp(u.padding, 0, 24, d.ui.padding);
	cfg.ui.opacitySolid = clamp(u.opacitySolid, 0, 1, d.ui.opacitySolid);
	cfg.ui.opacityFloating = clamp(u.opacityFloating, 0, 1, d.ui.opacityFloating);
	cfg.ui.opacityBackground = clamp(u.opacityBackground, 0, 1, d.ui.opacityBackground);
	cfg.ui.opacityHint = clamp(u.opacityHint, 0, 1, d.ui.opacityHint);

	for (const slot of Object.keys(DEFAULT_SLOTS)) {
		const s = raw.slots?.[slot];
		if (SCHEMES.includes(s)) cfg.slots[slot] = s;
	}

	cfg.toggles.hideNotification = raw.toggles?.hideNotification === true;
	cfg.toggles.hideStatusbar = raw.toggles?.hideStatusbar === true;

	for (const [k, v] of Object.entries(raw.customVars ?? {})) {
		if (Object.keys(cfg.customVars).length >= 64) break;
		if (/^--[A-Za-z0-9_-]{1,64}$/.test(k) && typeof v === "string" && !/[;{}<>]/.test(v))
			cfg.customVars[k] = v.slice(0, 256);
	}

	// Raw CSS is served only as text/css (never echoed into HTML). We still
	// strip anything that could break out of the stylesheet context.
	if (typeof raw.customCSS === "string" && raw.customCSS.trim())
		cfg.customCSS = raw.customCSS.replace(/<\/?(style|script)/gi, "").slice(0, 20000);

	return cfg;
}

/* Generates the live override block appended to the compiled theme. */
export function generateOverrides(cfg) {
	const root = [];
	const dark = [];
	const light = [];

	// text broadcasts / toggles
	if (cfg.toggles.hideNotification) root.push(`--Misono-MOTD: none;`);
	else if (cfg.motd !== null)
		root.push(`--Misono-MOTD: ${cfg.motd === "" ? "none" : cssString(cfg.motd)};`);

	if (cfg.toggles.hideStatusbar) root.push(`--Misono-Statusbar: none;`);
	else if (cfg.statusbar !== null)
		root.push(`--Misono-Statusbar: ${cfg.statusbar === "" ? "none" : cssString(cfg.statusbar)};`);

	if (cfg.branch !== null) root.push(`--Misono-Branch: ${cssString(cfg.branch)};`);
	if (cfg.font !== null) root.push(`--Misono-Font: ${cfg.font};`);

	// background (compose dim overlay + image into one value)
	if (cfg.background !== null) {
		const dim = cfg.backgroundDim > 0
			? `linear-gradient(rgba(0,0,0,${cfg.backgroundDim}),rgba(0,0,0,${cfg.backgroundDim})), `
			: "";
		root.push(`--Misono-Background: ${dim}url("${cfg.background}") center / cover fixed;`);
	}

	// feel
	root.push(
		`--SNDL-Animation_Multiplier: ${cfg.multipliers.animation};`,
		`--SNDL-Transition_Multiplier: ${cfg.multipliers.transition};`,
		`--SNDL-Blur_Multiplier: ${cfg.multipliers.blur};`,
		`--SNDL-UI_Border-Radius: ${cfg.ui.radius}px;`,
		`--SNDL-UI_Padding: ${cfg.ui.padding}px;`,
		`--SNDL-UI_Margin: ${cfg.ui.padding}px;`,
		`--SNDL-UI_Opacity_Solid: ${cfg.ui.opacitySolid};`,
		`--SNDL-UI_Opacity_Floating: ${cfg.ui.opacityFloating};`,
		`--SNDL-UI_Opacity_Background: ${cfg.ui.opacityBackground};`,
		`--SNDL-UI_Opacity_Hint: ${cfg.ui.opacityHint};`,
	);

	// accent — recolor the theme's accent surfaces (matches theme's own format)
	if (cfg.accent !== null) {
		root.push(
			`--Misono-Accent: ${cfg.accent};`,
			`--brand-500: rgba(${cfg.accent}, var(--SNDL-UI_Opacity_Solid));`,
			`--text-link: rgb(${cfg.accent});`,
			`--mention-foreground: rgb(${cfg.accent});`,
			`--interactive-active: rgb(${cfg.accent});`,
		);
	}

	// color slot remap (dark: Moon/Night/Abyss, light: Sun/Day/Sky)
	for (const [slot, scheme] of Object.entries(cfg.slots)) {
		if (scheme === DEFAULT_SLOTS[slot]) continue;
		const S = cap(scheme);
		dark.push(
			`--SNDL-${slot}_Primary: var(--${S}-Moon);`,
			`--SNDL-${slot}_Secondary: var(--${S}-Night);`,
			`--SNDL-${slot}_Tertiary: var(--${S}-Abyss);`,
			`--SNDL-${slot}I_Primary: var(--${S}-Sun);`,
			`--SNDL-${slot}I_Secondary: var(--${S}-Day);`,
			`--SNDL-${slot}I_Tertiary: var(--${S}-Sky);`,
		);
		light.push(
			`--SNDL-${slot}_Primary: var(--${S}-Sun);`,
			`--SNDL-${slot}_Secondary: var(--${S}-Day);`,
			`--SNDL-${slot}_Tertiary: var(--${S}-Sky);`,
			`--SNDL-${slot}I_Primary: var(--${S}-Moon);`,
			`--SNDL-${slot}I_Secondary: var(--${S}-Night);`,
			`--SNDL-${slot}I_Tertiary: var(--${S}-Abyss);`,
		);
	}

	for (const [k, v] of Object.entries(cfg.customVars)) root.push(`${k}: ${v};`);

	let out = `\n/* === Misono Worker overrides === */\nhtml {\n${root.join("\n")}\n}\n`;
	if (dark.length) out += `.theme-dark {\n${dark.join("\n")}\n}\n`;
	if (light.length) out += `.theme-light {\n${light.join("\n")}\n}\n`;
	if (cfg.customCSS) out += `\n/* --- custom CSS --- */\n${cfg.customCSS}\n`;
	return out;
}

/* ---------- request handling ---------- */

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
	"Access-Control-Allow-Headers": "Authorization, Content-Type",
};

const json = (data, status = 200) =>
	new Response(JSON.stringify(data, null, 2), {
		status,
		headers: { "Content-Type": "application/json", ...CORS },
	});

async function loadConfig(env) {
	if (!env.MISONO_KV) return sanitizeConfig(null);
	const stored = await env.MISONO_KV.get(CONFIG_KEY, "json");
	return sanitizeConfig(stored);
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (request.method === "OPTIONS")
			return new Response(null, { status: 204, headers: CORS });

		if (url.pathname === "/theme.css") {
			const cfg = await loadConfig(env);
			return new Response(THEME + generateOverrides(cfg), {
				headers: {
					"Content-Type": "text/css; charset=utf-8",
					"Cache-Control": "no-store",
					...CORS,
				},
			});
		}

		if (url.pathname === "/api/config") {
			if (request.method === "GET") {
				const cfg = await loadConfig(env);
				return json({ ...cfg, _saveEnabled: !!(env.MISONO_KV && env.MISONO_TOKEN) });
			}
			if (request.method === "PUT") {
				if (!env.MISONO_KV)
					return json({ error: "KV not bound — create the MISONO_KV namespace and redeploy" }, 503);
				const auth = request.headers.get("Authorization") ?? "";
				if (!env.MISONO_TOKEN || auth !== `Bearer ${env.MISONO_TOKEN}`)
					return json({ error: "unauthorized" }, 401);
				let body;
				try {
					body = await request.json();
				} catch {
					return json({ error: "invalid JSON" }, 400);
				}
				const cfg = sanitizeConfig(body);
				await env.MISONO_KV.put(CONFIG_KEY, JSON.stringify(cfg));
				return json(cfg);
			}
			return json({ error: "method not allowed" }, 405);
		}

		if (url.pathname === "/")
			return new Response(PANEL, {
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});

		return json({ error: "not found" }, 404);
	},
};
