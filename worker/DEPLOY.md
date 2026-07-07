# Deploying Misono from the Cloudflare dashboard

No CLI, no tokens in chat — everything stays in your Cloudflare account.

## 1. Create the KV namespace

Dashboard → **Storage & Databases → KV → Create a namespace**.
Name it `MISONO_KV`. Copy the **Namespace ID** it gives you.

Paste that id into `worker/wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "MISONO_KV"
id = "the-id-you-just-copied"
```

Commit and push that change — the dashboard build reads `wrangler.toml`.

## 2. Connect the repo

Dashboard → **Workers & Pages → Create → Workers → Connect to Git** (a.k.a.
"Import a repository"). Pick `ZapGaming/misono` and the
`claude/misono-discord-theme-zqadq9` branch (or `main` once merged).

Build settings:

| Field | Value |
|---|---|
| **Root directory** | `worker` |
| **Build command** | *(leave empty)* — `worker/src/theme.css` is already committed |
| **Deploy command** | `npx wrangler deploy` *(default; dashboard fills this in)* |

> The compiled theme is checked into the repo, so no build step is required.
> If you edit anything in `src/`, run `node scripts/build.mjs` locally and commit
> the refreshed `dist/misono.theme.css` + `worker/src/theme.css` before pushing.

## 3. Set the admin token

After the first deploy: Worker → **Settings → Variables and Secrets → Add** →
type **Secret**, name **`MISONO_TOKEN`**, value = whatever password you want for
the control panel. Redeploy if prompted.

This is the token the control panel asks for — it's separate from any Cloudflare
API token, and it never goes in the repo.

## 4. Use it

- **Theme URL** (add in Vencord → Themes → Online Themes):
  `https://misono.<your-subdomain>.workers.dev/theme.css`
- **Control panel:** `https://misono.<your-subdomain>.workers.dev/`
  Enter your `MISONO_TOKEN`, tweak, **Save & Publish**. Clients pick up changes
  on their next theme refresh (toggle the theme or reload Discord to force it).

## Notes

- Every push to the connected branch triggers a fresh deploy.
- KV writes are eventually consistent (a few seconds) — normal.
- `/theme.css` is served with `Cache-Control: no-store` so overrides apply fast.
