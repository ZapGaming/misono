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

// A slot may also point at the user-editable "custom" scheme.
export const SLOT_SCHEMES = [...SCHEMES, "custom"];

// Six stops of the editable custom palette (dark→light), triplet strings.
export const CUSTOM_STOPS = ["abyss", "night", "moon", "sky", "day", "sun"];
export const DEFAULT_CUSTOM_SCHEME = {
	abyss: "20, 0, 30", night: "35, 10, 50", moon: "55, 20, 80",
	sky: "90, 45, 130", day: "130, 80, 180", sun: "170, 120, 230",
};

// Discord status vars each status color drives.
const STATUS_VARS = {
	online: ["--status-online", "--icon-status-online", "--text-status-online"],
	idle: ["--icon-status-idle", "--text-status-idle"],
	dnd: ["--status-danger", "--icon-status-dnd", "--text-status-dnd"],
	offline: ["--icon-status-offline", "--text-status-offline"],
	streaming: ["--status-speaking", "--icon-voice-speaking", "--text-voice-speaking"],
};

export const DEFAULT_CONFIG = {
	motd: null,          // string, "" to hide, null for theme default
	statusbar: null,     // string, "" to hide, null for theme default
	branch: null,        // override --Misono-Branch label
	background: null,    // https URL or null
	backgroundDim: 0,    // 0..1 dark overlay over the background image
	surface: null,       // base UI color "R, G, B" — repaints all surfaces, both modes
	textColor: null,     // text color triplet; null = auto-contrast from surface
	accent: null,        // "R, G, B" triplet or null (keep theme's cyan accent)
	font: null,          // font-family string, e.g. 'Comic Sans MS'
	multipliers: { animation: 1, transition: 1, blur: 1 },
	ui: {
		radius: 33,            // px
		padding: 8,            // px
		borderSize: 4,         // px
		outlineSize: 1,        // px
		opacitySolid: 0.8,
		opacityFloating: 0.5,
		opacityBackground: 0.25,
		opacityHint: 0.1,
	},
	zoom: 1,                 // 0.7..1.5 whole-UI scale
	letterSpacing: 0,        // em, 0 = normal
	avatarShape: "round",    // round | rounded | square
	effects: {
		saturation: 1,         // 0..2
		contrast: 1,           // 0.5..1.5
		brightness: 1,         // 0.5..1.5
		reduceMotion: false,   // near-instant animations/transitions
	},
	status: {                // status dot colors (triplet or null = theme default)
		online: null, idle: null, dnd: null, offline: null, streaming: null,
	},
	backgroundGradient: {    // alternative to a background image
		enabled: false, from: null, to: null, angle: 160,
	},
	customScheme: { ...DEFAULT_CUSTOM_SCHEME }, // editable 6-stop palette
	slots: { ...DEFAULT_SLOTS }, // SNDL color slot -> scheme (incl. "custom")
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
	cfg.surface = parseTriplet(raw.surface);
	cfg.textColor = parseTriplet(raw.textColor);
	cfg.accent = parseTriplet(raw.accent);
	if (isSafeFont(raw.font)) cfg.font = raw.font;

	const m = raw.multipliers ?? {};
	cfg.multipliers.animation = clamp(m.animation, 0, 10, d.multipliers.animation);
	cfg.multipliers.transition = clamp(m.transition, 0, 10, d.multipliers.transition);
	cfg.multipliers.blur = clamp(m.blur, 0, 10, d.multipliers.blur);

	const u = raw.ui ?? {};
	cfg.ui.radius = clamp(u.radius, 0, 64, d.ui.radius);
	cfg.ui.padding = clamp(u.padding, 0, 24, d.ui.padding);
	cfg.ui.borderSize = clamp(u.borderSize, 0, 8, d.ui.borderSize);
	cfg.ui.outlineSize = clamp(u.outlineSize, 0, 6, d.ui.outlineSize);
	cfg.ui.opacitySolid = clamp(u.opacitySolid, 0, 1, d.ui.opacitySolid);
	cfg.ui.opacityFloating = clamp(u.opacityFloating, 0, 1, d.ui.opacityFloating);
	cfg.ui.opacityBackground = clamp(u.opacityBackground, 0, 1, d.ui.opacityBackground);
	cfg.ui.opacityHint = clamp(u.opacityHint, 0, 1, d.ui.opacityHint);

	cfg.zoom = clamp(raw.zoom, 0.7, 1.5, d.zoom);
	cfg.letterSpacing = clamp(raw.letterSpacing, -0.1, 0.3, d.letterSpacing);
	if (["round", "rounded", "square"].includes(raw.avatarShape)) cfg.avatarShape = raw.avatarShape;

	const e = raw.effects ?? {};
	cfg.effects.saturation = clamp(e.saturation, 0, 2, d.effects.saturation);
	cfg.effects.contrast = clamp(e.contrast, 0.5, 1.5, d.effects.contrast);
	cfg.effects.brightness = clamp(e.brightness, 0.5, 1.5, d.effects.brightness);
	cfg.effects.reduceMotion = raw.effects?.reduceMotion === true;

	for (const k of Object.keys(d.status)) {
		const t = parseTriplet(raw.status?.[k]);
		if (t) cfg.status[k] = t;
	}

	const g = raw.backgroundGradient ?? {};
	cfg.backgroundGradient.from = parseTriplet(g.from);
	cfg.backgroundGradient.to = parseTriplet(g.to);
	cfg.backgroundGradient.angle = clamp(g.angle, 0, 360, d.backgroundGradient.angle);
	cfg.backgroundGradient.enabled =
		g.enabled === true && !!cfg.backgroundGradient.from && !!cfg.backgroundGradient.to;

	for (const stop of CUSTOM_STOPS) {
		const t = parseTriplet(raw.customScheme?.[stop]);
		if (t) cfg.customScheme[stop] = t;
	}

	for (const slot of Object.keys(DEFAULT_SLOTS)) {
		const s = raw.slots?.[slot];
		if (SLOT_SCHEMES.includes(s)) cfg.slots[slot] = s;
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

// Build a 3-step surface ramp + contrasting text from one base color.
// Dark bases layer lighter; light bases layer darker. Text auto-contrasts.
export function rampFromBase(triplet) {
	const [r, g, b] = triplet.split(",").map((n) => +n.trim());
	const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b; // perceived luminance
	const dark = lum < 140;
	const toward = dark ? 255 : 0;
	const step = (amt) => [r, g, b].map((c) => Math.round(c + (toward - c) * amt)).join(", ");
	return {
		primary: `${r}, ${g}, ${b}`,
		secondary: step(0.07),
		tertiary: step(0.14),
		text: dark ? "231, 227, 233" : "26, 20, 30",
		header: dark ? "247, 244, 249" : "12, 8, 16",
	};
}

/* Generates the live override block appended to the compiled theme. */
export function generateOverrides(cfg) {
	const root = [];
	const dark = [];
	const light = [];

	// Base surface color — repaints the dominant SNC surfaces in BOTH modes.
	// Emitted in .theme-dark/.theme-light so it out-specifies the theme's own
	// class-scoped definitions (an html{} rule would lose to them).
	if (cfg.surface !== null) {
		const ramp = rampFromBase(cfg.surface);
		const text = cfg.textColor ?? ramp.text;
		const block = [
			`--SNC-Primary: ${ramp.primary};`,
			`--SNC-Secondary: ${ramp.secondary};`,
			`--SNC-Tertiary: ${ramp.tertiary};`,
			`--SNC-Solid: rgb(${ramp.primary});`,
			`--SNC-Text: rgb(${text});`,
			`--SNC-Header: rgb(${ramp.header});`,
		];
		dark.push(...block);
		light.push(...block);
	}

	// text broadcasts / toggles
	if (cfg.toggles.hideNotification) root.push(`--Misono-MOTD: none;`);
	else if (cfg.motd !== null)
		root.push(`--Misono-MOTD: ${cfg.motd === "" ? "none" : cssString(cfg.motd)};`);

	if (cfg.toggles.hideStatusbar) root.push(`--Misono-Statusbar: none;`);
	else if (cfg.statusbar !== null)
		root.push(`--Misono-Statusbar: ${cfg.statusbar === "" ? "none" : cssString(cfg.statusbar)};`);

	if (cfg.branch !== null) root.push(`--Misono-Branch: ${cssString(cfg.branch)};`);
	if (cfg.font !== null) root.push(`--Misono-Font: ${cfg.font};`);

	// background — gradient builder wins over image; both accept a dim overlay
	const dim = cfg.backgroundDim > 0
		? `linear-gradient(rgba(0,0,0,${cfg.backgroundDim}),rgba(0,0,0,${cfg.backgroundDim})), `
		: "";
	if (cfg.backgroundGradient.enabled) {
		const { from, to, angle } = cfg.backgroundGradient;
		root.push(`--Misono-Background: ${dim}linear-gradient(${angle}deg, rgb(${from}), rgb(${to})) fixed;`);
	} else if (cfg.background !== null) {
		root.push(`--Misono-Background: ${dim}url("${cfg.background}") center / cover fixed;`);
	}

	// scale / typography effects
	if (cfg.zoom !== 1) root.push(`--Misono-Zoom: ${cfg.zoom};`);
	if (cfg.letterSpacing !== 0) root.push(`--Misono-Letter_Spacing: ${cfg.letterSpacing}em;`);
	const fx = cfg.effects;
	if (fx.saturation !== 1 || fx.contrast !== 1 || fx.brightness !== 1)
		root.push(`--Misono-Filter: saturate(${fx.saturation}) contrast(${fx.contrast}) brightness(${fx.brightness});`);

	// feel — reduce-motion collapses animation/transition timing to ~instant
	const anim = fx.reduceMotion ? 0.001 : cfg.multipliers.animation;
	const trans = fx.reduceMotion ? 0.001 : cfg.multipliers.transition;
	root.push(
		`--SNDL-Animation_Multiplier: ${anim};`,
		`--SNDL-Transition_Multiplier: ${trans};`,
		`--SNDL-Blur_Multiplier: ${cfg.multipliers.blur};`,
		`--SNDL-UI_Border-Radius: ${cfg.ui.radius}px;`,
		`--SNDL-UI_Padding: ${cfg.ui.padding}px;`,
		`--SNDL-UI_Margin: ${cfg.ui.padding}px;`,
		`--SNDL-UI_Border-Size: ${cfg.ui.borderSize}px;`,
		`--SNDL-UI_Outline-Size: ${cfg.ui.outlineSize}px;`,
		`--SNDL-UI_Opacity_Solid: ${cfg.ui.opacitySolid};`,
		`--SNDL-UI_Opacity_Floating: ${cfg.ui.opacityFloating};`,
		`--SNDL-UI_Opacity_Background: ${cfg.ui.opacityBackground};`,
		`--SNDL-UI_Opacity_Hint: ${cfg.ui.opacityHint};`,
	);

	// avatar shape via the theme's circle-radius token
	if (cfg.avatarShape !== "round")
		root.push(`--SNDL-UI_Border-Radius_Circle: ${cfg.avatarShape === "square" ? 0 : 12}px;`);

	// status dot colors
	for (const [k, vars] of Object.entries(STATUS_VARS)) {
		if (cfg.status[k] === null) continue;
		for (const v of vars) root.push(`${v}: rgba(${cfg.status[k]}, var(--SNDL-UI_Opacity_Solid));`);
	}

	// custom scheme stops — only emitted when a slot actually points at "custom"
	if (Object.values(cfg.slots).includes("custom"))
		for (const stop of CUSTOM_STOPS) root.push(`--Custom-${cap(stop)}: ${cfg.customScheme[stop]};`);

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
