# Deploying Misono from the Cloudflare dashboard

No CLI, no tokens in chat — everything stays in your Cloudflare account. The
Worker deploys **green on the first try even with zero config**; you add KV +
the admin token afterward to unlock saving from the control panel.

## 1. Connect the repo (Workers — *not* Pages)

> ⚠️ If you pick **Pages**, you'll get *"Could not detect a directory containing
> static files."* Misono is a **Worker**, not a static site. Use the Workers flow.

Dashboard → **Workers & Pages → Create → Workers → Import a repository**.
Pick `ZapGaming/misono` and the branch (`claude/misono-discord-theme-zqadq9`,
or `main` once merged).

Build settings:

| Field | Value |
|---|---|
| **Root directory** | *(leave blank — repo root)* |
| **Build command** | *(leave empty)* — the compiled theme is committed |
| **Deploy command** | `npx wrangler deploy` *(dashboard default)* |

`wrangler.toml` lives at the repo root, so Cloudflare auto-detects a Worker and
finds `main = "worker/src/index.js"`. Deploy — it will succeed immediately and
serve the theme at `/theme.css`.

## 2. Add KV (unlocks saving)

Dashboard → **Storage & Databases → KV → Create a namespace** named
`MISONO_KV`. Copy its **Namespace ID**, then in `wrangler.toml` uncomment:

```toml
[[kv_namespaces]]
binding = "MISONO_KV"
id = "paste-the-id-here"
```

Commit + push (triggers a redeploy). Until this exists the control panel loads
but shows a "saving disabled" banner.

## 3. Add the admin token

Worker → **Settings → Variables and Secrets → Add** → type **Secret**, name
**`MISONO_TOKEN`**, value = whatever password you want for the panel. This is
separate from any Cloudflare API token and never goes in the repo.

## 4. Use it

- **Theme URL** (Vencord → Themes → Online Themes):
  `https://misono.<your-subdomain>.workers.dev/theme.css`
- **Control panel:** `https://misono.<your-subdomain>.workers.dev/`
  Enter your `MISONO_TOKEN`, tweak, **Save & Publish**. Clients pick up changes
  on their next theme refresh (toggle the theme or reload Discord to force it).

## Notes

- Every push to the connected branch triggers a fresh deploy.
- `/theme.css` is served `Cache-Control: no-store`, so overrides apply fast.
- KV writes are eventually consistent (a few seconds) — normal.
- Editing `src/`? Run `node scripts/build.mjs` locally and commit the refreshed
  `dist/misono.theme.css` + `worker/src/theme.css` before pushing.
