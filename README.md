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
| `src/dynamic.css` | Runtime hooks the Worker drives (`--Misono-MOTD`, background, …) |
| `scripts/build.mjs` | Zero-dependency compiler → `dist/` + `worker/src/theme.css` |
| `scripts/test.mjs` | Override-generator tests |
| `worker/` | Cloudflare Worker: theme endpoint, config API, control panel |

## Building the theme

```sh
node scripts/build.mjs   # → dist/misono.theme.css (also refreshes worker/src/theme.css)
node scripts/test.mjs    # smoke tests
```

Use `dist/misono.theme.css` directly as a static Vencord theme, or deploy the Worker for
the full dynamic experience.

## Deploying the Worker

```sh
cd worker
wrangler kv namespace create MISONO_KV   # put the returned id into wrangler.toml
wrangler secret put MISONO_TOKEN         # choose your admin token
wrangler deploy
```

Then in **Vencord → Themes → Online Themes**, add:

```
https://<your-worker>.workers.dev/theme.css
```

Open `https://<your-worker>.workers.dev/` to reach the control panel. Enter your admin
token (stored in your browser only), tweak, and hit **Save & Publish** — clients pick up
changes whenever Vencord refetches the theme (toggle it or reload to force).

## What you can control live

- **MOTD** — the fake login notification text (or hide it)
- **Status bar** text and **branch** label
- **Background image** (any https URL)
- **Animation / transition / blur multipliers** (0× to 4×)
- **Border radius** and the four **UI opacity** levels
- **Color slot remapping** — point any SNDL slot at any scheme
  (e.g. `Green → mika` pink-shifts everything green)
- **Custom variables** — arbitrary `--Var: value` pairs via the API (escape-checked)

## License

TSN License 2.1 Strict. Do not circumvent, modify, or redistribute the compiled CSS —
only modify the files provided in this repository.
