# VPS deployment

This site is built on the VPS and served by Nginx. GitHub is used for OAuth identity and Git history only.

## GitHub setup

Create a GitHub OAuth App:

- Homepage URL: `https://example.com`
- Authorization callback URL: `https://example.com/oauth/callback`

Create a GitHub webhook for this repository:

- Payload URL: `https://example.com/deploy/github`
- Content type: `application/json`
- Secret: same value as `DEPLOY_WEBHOOK_SECRET`
- Events: push

## VPS files

Create separate service users and clone the repo to `/var/www/narrow-x`:

```sh
getent group narrow-x >/dev/null || sudo groupadd --system narrow-x
id narrow-x-oauth >/dev/null 2>&1 || sudo useradd --system --gid narrow-x --home-dir /var/lib/narrow-x-oauth --shell /usr/sbin/nologin narrow-x-oauth
id narrow-x-deploy >/dev/null 2>&1 || sudo useradd --system --gid narrow-x --home-dir /var/lib/narrow-x-deploy --shell /usr/sbin/nologin narrow-x-deploy
sudo usermod -aG narrow-x www-data
sudo mkdir -p /var/www/narrow-x
sudo chown -R narrow-x-deploy:narrow-x /var/www/narrow-x
sudo -u narrow-x-deploy git clone https://github.com/your-github/narrow-x.git /var/www/narrow-x
sudo mkdir -p /etc/narrow-x
sudo cp deploy/oauth.env.example /etc/narrow-x/oauth.env
sudo cp deploy/deploy.env.example /etc/narrow-x/deploy.env
sudo chmod 600 /etc/narrow-x/oauth.env /etc/narrow-x/deploy.env
```

Set OAuth variables in `/etc/narrow-x/oauth.env` and deploy variables in `/etc/narrow-x/deploy.env`.
Keep `OAUTH_GITHUB_ALLOWED_ID=185045939` and `OAUTH_ALLOWED_ORIGIN=https://example.com`; the OAuth service rejects every other GitHub account and every other opener origin. The OAuth service now validates its environment at startup and exits non-zero with the missing variable names, so a bad env file fails fast instead of failing on the first request.

Deploy knobs in `deploy.env`:

- `DEPLOY_TIMEOUT_MS` (default `600000`): the webhook kills a deploy child that runs longer than this (SIGTERM, then SIGKILL after 10 s) and clears its running flag.
- `DEPLOY_MIN_FREE_MB` (default `2048`): the deploy script refuses to start when the releases filesystem has less free space, before taking the lock.
- `DEPLOY_SITE_CHECK_URL` (default `http://127.0.0.1/`): after switching `current`, the deploy requires `/healthz` to pass and the site root to return HTTP 200 with a body containing `<html`, otherwise it restores the previous release.

The webhook passes the deploy child an explicit environment allowlist (`PATH`, `HOME`, locale, and the `DEPLOY_*`/`ASTRO_*` variables the script reads). `DEPLOY_WEBHOOK_SECRET` is never in the child environment. New variables the script should see must be added to `CHILD_ENV_ALLOWLIST` in `server/deploy-webhook.mjs`.

Webhook behavior:

- A signed push that arrives while a deploy is running is answered with `202 Deploy queued`; when the running deploy finishes (success or failure) exactly one follow-up deploy starts. Multiple queued pushes collapse into that single follow-up.
- Valid signed requests are remembered by HMAC signature for 24 hours, in addition to the delivery-id dedupe. A captured request replayed with a fresh delivery id is ignored. Side effect: GitHub's "Redeliver" button on an already-deployed push is also ignored; push a new commit or run the deploy script manually instead.

The deploy user owns the repository, release directories, and `current` link. The shared `narrow-x` group gives OAuth and Nginx read access only. Keep both env files owned by root with mode `600`; do not put them inside the repository.

Edit `public/admin/config.yml`:

```yml
backend:
  auth_methods: [oauth]
  base_url: https://example.com
```

The OAuth-only setting removes personal access token sign-in. Sveltia's local repository option is available only on `localhost` and is not shown on the production domain.

Install and build:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm build
```

## Service code copy in /opt

The systemd units execute a root-owned copy of the server code at `/opt/narrow-x/services/`, not the deploy-writable checkout in `/var/www/narrow-x`. A compromised or buggy deploy therefore cannot rewrite the code that the long-running services execute. Create the copy once:

```sh
sudo mkdir -p /opt/narrow-x/services
sudo cp /var/www/narrow-x/server/oauth.mjs /var/www/narrow-x/server/deploy-webhook.mjs /opt/narrow-x/services/
sudo chown -R root:root /opt/narrow-x
sudo chmod 755 /opt/narrow-x /opt/narrow-x/services
sudo chmod 644 /opt/narrow-x/services/*.mjs
```

The units keep reading env files from `/etc/narrow-x/*.env` as before. After changing anything under `server/`, deploy the commit, then refresh the copy and restart:

```sh
sudo cp /var/www/narrow-x/server/oauth.mjs /var/www/narrow-x/server/deploy-webhook.mjs /opt/narrow-x/services/
sudo systemctl restart narrow-x-oauth narrow-x-deploy-webhook
curl -fsS http://127.0.0.1:4180/healthz
curl -fsS http://127.0.0.1:4181/healthz
```

The copy is not updated automatically; the running services keep executing the old code until you copy and restart.

Install services:

```sh
sudo cp deploy/narrow-x-oauth.service /etc/systemd/system/
sudo cp deploy/narrow-x-deploy-webhook.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now narrow-x-oauth narrow-x-deploy-webhook
```

Both units are sandboxed (`ProtectSystem=strict`, `SystemCallFilter=@system-service`, kernel/namespace/realtime restrictions, empty capability set). Only the webhook unit has `ReadWritePaths=/var/www/narrow-x`, which the spawned deploy script needs. Do not add `MemoryDenyWriteExecute`; it breaks the Node JIT. Keep `SystemCallErrorNumber=EPERM` paired with the filter: without it, filtered syscalls kill the process with SIGSYS — the native TypeScript 7 `tsc` binary probes `fanotify_init` (syscall 300) during webhook builds and was core-dumped (exit 159) until filtered calls were switched to returning EPERM, which lets the toolchain fall back gracefully.

Install Nginx config:

```sh
sudo cp deploy/nginx.conf /etc/nginx/sites-available/narrow-x
sudo ln -s /etc/nginx/sites-available/narrow-x /etc/nginx/sites-enabled/narrow-x
sudo nginx -t
sudo systemctl reload nginx
```

The Nginx config sets security headers on every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Strict-Transport-Security: max-age=15552000`, a `Permissions-Policy`, and a `Content-Security-Policy`. Notes:

- The site CSP allows `https://giscus.app` (comments script + iframe). `script-src` carries a `sha256-` hash allowlist for the built inline scripts instead of `'unsafe-inline'` (`style-src` keeps `'unsafe-inline'` for inline style attributes). `pnpm run csp:self-test` verifies `deploy/nginx.conf` against `dist/`; the deploy pipeline and CI run it, so changing any inline script requires regenerating the hashes (`node scripts/gen-csp-hashes.mjs`), updating `deploy/nginx.conf`, and doing a maintenance deployment. If you later enable Umami analytics in `src/config/site.ts`, you must add its origin to `script-src` and `connect-src` in `deploy/nginx.conf` or the tracker will be blocked.
- `/admin/index.html` has its own stricter policy: `X-Frame-Options: DENY` and a CSP allowing only the self-hosted Sveltia bundle (`public/admin/sveltia-cms-<version>.js`) plus GitHub API/content origins. To upgrade Sveltia, download the new `dist/sveltia-cms.js` from the `@sveltia/cms` npm package, verify its SHA-512 against the release, replace the versioned file, and update the filename in `public/admin/index.html`.
- Nginx `add_header` is not additive across levels: any `location` that declares its own `add_header` drops all inherited ones, so the full header set is intentionally repeated in those locations. When editing, re-declare the whole set.
- `/oauth` is rate-limited to 30 requests/minute (burst 30) and `/deploy/github` to 10 requests/minute (burst 20) per client IP (`CF-Connecting-IP` from the tunnel), returning 429 above that.

Because `nginx -t` cannot run in this repository, always run it on the VPS before reloading.

The deploy hook builds a commit in `/var/www/narrow-x/releases/<commit>/`, checks it, then atomically switches `/var/www/narrow-x/current`. Nginx must use `root /var/www/narrow-x/current;` as in `deploy/nginx.conf`.

The deploy script force-synchronizes the checkout with `git reset --hard origin/main` (the `/var/www` checkout is disposable, so force-pushed history deploys cleanly). Never commit local changes inside `/var/www/narrow-x`; they will be discarded on the next deploy. It also fails early when free disk space is below `DEPLOY_MIN_FREE_MB`, exits `1` when another deploy holds the lock (manual runs see the failure; the webhook queues instead), and after pruning old releases (each pruned release directory takes its `node_modules` with it) runs `pnpm store prune` to drop unreferenced store entries.

`current` points to the static `dist` directory. The OAuth and webhook services execute the root-owned copy in `/opt/narrow-x/services/`, so neither a static release switch nor a repository update reloads Node code. After changing anything under `server/`, a systemd unit, or a production environment file, refresh the `/opt` copy (see "Service code copy in /opt"), then restart and verify both services:

```sh
sudo cp /var/www/narrow-x/server/oauth.mjs /var/www/narrow-x/server/deploy-webhook.mjs /opt/narrow-x/services/
sudo systemctl restart narrow-x-oauth narrow-x-deploy-webhook
sudo systemctl is-active narrow-x-oauth narrow-x-deploy-webhook
systemctl show narrow-x-oauth narrow-x-deploy-webhook \
  -p MainPID -p ActiveEnterTimestamp --no-pager
curl -fsS http://127.0.0.1:4180/healthz
curl -fsS http://127.0.0.1:4181/healthz
```

The webhook refuses changes under `server/`, `deploy/*.service`, or `deploy/nginx.conf` unless `DEPLOY_ALLOW_MAINTENANCE=1` is set. Use the explicit maintenance path for those changes:

```sh
sudo -u narrow-x-deploy env \
  DEPLOY_ALLOW_MAINTENANCE=1 \
  APP_DIR=/var/www/narrow-x \
  REPO_DIR=/var/www/narrow-x \
  ASTRO_SITE=https://example.com \
  DEPLOY_HEALTHCHECK_URL=http://127.0.0.1/healthz \
  DEPLOY_HEALTHCHECK_HOST=example.com \
  bash /var/www/narrow-x/scripts/deploy-vps.sh
```

Afterward, install any changed unit or Nginx file, then reload/restart only the affected service. For `server/` changes, restart both Node services and repeat the health checks above. A normal content-only push must not set `DEPLOY_ALLOW_MAINTENANCE=1`.

Record the service start time and compare the repository commit with the static release without running `git` as root:

```sh
sudo -u narrow-x-deploy git -C /var/www/narrow-x rev-parse HEAD
basename "$(dirname "$(readlink -f /var/www/narrow-x/current)")"
```

The two values must match before accepting a release. `scripts/rollback-vps.sh` currently rolls back only the static release; for a runtime change, revert the corresponding commit, deploy it, restart both services, and repeat the health checks. Do not describe a static rollback as a full runtime rollback.

After Nginx is installed, create the first release with the same script used by the webhook:

```sh
sudo -u narrow-x-deploy env \
  APP_DIR=/var/www/narrow-x \
  REPO_DIR=/var/www/narrow-x \
  ASTRO_SITE=https://example.com \
  DEPLOY_HEALTHCHECK_URL=http://127.0.0.1/healthz \
  DEPLOY_HEALTHCHECK_HOST=example.com \
  bash /var/www/narrow-x/scripts/deploy-vps.sh
```

## Checks

```sh
curl http://127.0.0.1:4180/healthz
curl http://127.0.0.1:4181/healthz
pnpm oauth:self-test
pnpm deploy:self-test
pnpm deploy:policy:self-test
pnpm typecheck
pnpm build
```

## Production smoke and rollback

Run the public boundary check from a machine that is not bypassing Cloudflare:

```sh
pnpm production:smoke:self-test
SMOKE_BASE_URL=https://example.com pnpm production:smoke
```

The check expects public pages and assets to return `200`, `/admin/index.html` to remain protected, `/oauth` to redirect to GitHub, and an unsigned webhook request to be rejected by the origin.

"Protected" for `/admin/index.html` means a `401`/`403`, or a redirect whose `Location` host is the configured auth host (or a subdomain of it). Set `SMOKE_AUTH_HOST` to change it; the default is `cloudflareaccess.com`. Any other redirect counts as NOT protected.

To roll back, run the checked rollback script as the deploy user. Without `ROLLBACK_TO` it selects the newest complete release strictly older (by mtime) than the current target, so repeated rollbacks walk backward through history instead of ping-ponging; it errors out clearly when no older release exists. If a failed deploy left the `current` symlink missing or dangling, the script restores the newest complete release instead of refusing to run.

```sh
sudo -u narrow-x-deploy env \
  APP_DIR=/var/www/narrow-x \
  DEPLOY_HEALTHCHECK_URL=http://127.0.0.1/healthz \
  DEPLOY_HEALTHCHECK_HOST=example.com \
  bash /var/www/narrow-x/scripts/rollback-vps.sh
```

To select a specific retained release, add `ROLLBACK_TO=<full-commit>`. The script validates that the target is inside `releases/`, switches the symlink atomically, checks health, and restores the prior target if the check fails.
