# Misono

**The Sirio Network's dynamic Discord theme** — the successor to Flashcord, rebuilt to be
controlled *live* from a Cloudflare Worker control panel. Change colors, blur, animation
speed, background, even broadcast a MOTD to every connected client — without recompiling
or redistributing CSS.

> Misono (CSS) © The Sirio Network (2026) // TSN License 2.1 Strict
> FROM ASCELLAYN, WITH LOVE

## How it works

```
src/  ──build──▶  dist/misono.theme.css  ──▶  worker/src/theme.css
                                                    │
                              Cloudflare Worker  ◀──┘
                              ├── GET  /theme.css   theme + live overrides (Vencord points here)
                              ├── GET  /api/config  current config (JSON)
                              ├── PUT  /api/config  update config (Bearer token)
                              └── GET  /            control panel
```

The theme is built on the **SNDL design language**: every color is an RGB-triplet custom
property, organized into 11 character schemes (Arellyan, Ascellyan, Sagittariian, Wakamo,
Maple, Seia, Otogi, Glacier, Marine, Nebula, Mika), each with six stops
(`Abyss → Night → Moon → Sky → Day → Sun`). Schemes map into SNDL color *slots*
(Black/White/Grey/Red/…/Pink), which feed the SNC computed layer, which feeds every
Discord variable. Because everything is variables, the Worker can restyle the entire
client by appending one small `html {}` block.

## Repository layout

| Path | What |
|---|---|
| `src/misono.css` | Core theme — SNDL tokens, SNC layer, Discord remap, components |
| `src/fonts.css` | Self-hosted Roboto `@font-face` set |
| `src/schemes/*.css` | Character color schemes |
| `src/themes/dark.css`, `light.css` | Scheme → SNDL slot mappings per Discord theme |
| `src/dynamic.css` | Runtime hooks the Worker drives (`--Misono-MOTD`, font, background, …) |
| `scripts/build.mjs` | Zero-dependency compiler → `dist/` + `worker/src/theme.css` |
| `scripts/test.mjs` | Worker override/sanitization/routing tests |
| `wrangler.toml` | Worker config (repo root, so the dashboard auto-detects it) |
| `worker/src/` | Worker: `index.js` (endpoints), `panel.html` (control panel), `theme.css` (built) |
| `worker/DEPLOY.md` | Step-by-step dashboard deploy guide |

## Building the theme

```sh
node scripts/build.mjs   # → dist/misono.theme.css (also refreshes worker/src/theme.css)
node scripts/test.mjs    # smoke tests
```

Use `dist/misono.theme.css` directly as a static Vencord theme, or deploy the Worker for
the full dynamic experience.

## Deploying the Worker

**Dashboard (recommended, no CLI):** see [`worker/DEPLOY.md`](worker/DEPLOY.md). In short —
connect the repo via **Workers → Import a repository** (leave root directory and build
command blank; `wrangler.toml` at the repo root makes Cloudflare detect the Worker), deploy,
then add the `MISONO_KV` namespace and `MISONO_TOKEN` secret to unlock saving. It deploys
green with zero config; KV/token just gate the save button.

**CLI:**

```sh
wrangler deploy                          # serves immediately (saving disabled)
wrangler kv namespace create MISONO_KV   # uncomment + paste id in wrangler.toml
wrangler secret put MISONO_TOKEN         # choose your control-panel password
wrangler deploy
```

Then in **Vencord → Themes → Online Themes**, add:

```
https://misono.<your-subdomain>.workers.dev/theme.css
```

Open `https://misono.<your-subdomain>.workers.dev/` for the control panel. Enter your admin
token (stored in your browser only), tweak, and hit **Save & Publish** — clients pick up
changes whenever Vencord refetches the theme (toggle it or reload to force).

## What you can control live

- **Presets** — one-click looks (Sakura, Nebula Night, Glacier, Sharp Mode, Zen, Vaporwave, Monochrome, OLED) you can then tweak
- **MOTD** — the fake login notification text, or hide it entirely
- **Status bar** text + **branch** label, or hide the status bar
- **Accent color** — any hex/RGB; recolors links, mentions, brand & active states
- **Font family** — swap the global font (validated)
- **Background** — image URL **or** a two-color **gradient builder** (angle + colors), with a **dim overlay**
- **Scale & effects** — whole-UI **zoom**, **letter spacing**, and a global color grade (**saturation / contrast / brightness**), plus **reduce-motion**
- **Shape** — **avatar shape** (round / rounded / square), **border** & **outline** size
- **Status dot colors** — online / idle / dnd / offline / streaming
- **Animation / transition / blur multipliers** (0×–4×)
- **Border radius**, **padding**, and the four **UI opacity** levels
- **Color slot remapping** — point any SNDL slot at any character scheme
  (e.g. `Green → mika` pink-shifts everything green)
- **Custom palette** — edit your own 6-stop RGB ramp and map any slot to it
- **Custom CSS** — raw CSS appended to the served theme (token-gated power-user hatch)
- **Custom variables** — arbitrary `--Var: value` pairs via the API (escape-checked)

All input is sanitized server-side (numeric clamps, URL scheme checks, hex/RGB triplet
parsing, font/var/CSS escaping) before it ever reaches `/theme.css`.

## License

TSN License 2.1 Strict. Do not circumvent, modify, or redistribute the compiled CSS —
only modify the files provided in this repository.
