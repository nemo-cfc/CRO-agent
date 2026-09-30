# Running the web app on EC2 (own domain)

[deploy-aws.md](deploy-aws.md) puts the **worker** on AWS and leaves the **web app** on Vercel. This guide adds the web app to the same EC2 server, served on its own domain, so the whole product runs off Vercel.

```
Shopper ──> audit.<domain> (Caddy) ──> apps/web (Next.js, :3000) ──WORKER_URL──> apps/worker (Docker, :8787) ──> the store being audited
                                             │
                                             └── apps/web/data (reports, leads, grants) on local disk
```

Set up the worker first by following [deploy-aws.md](deploy-aws.md) sections 1–3. With both on one server, size up to **`t3.medium` (4 GB)**: the web app launches its own Chromium to render report PDFs, on top of the worker's.

## Things that break if missed

1. **`SITE_URL` must be the public origin**, for example `https://audit.<domain>`. `POST /api/reports` rejects any request whose `Origin` is not the app's own origin or `SITE_URL`. Behind Caddy the app sees its internal origin, so without `SITE_URL` every audit fails with "Request origin is not allowed".
2. **Reports are stored on disk** in `apps/web/data/` when `BLOB_READ_WRITE_TOKEN` is not set. That directory holds every report, lead and unlock grant: keep it on persistent disk, back it up, and run **one** web instance. To share storage across instances instead, set `BLOB_READ_WRITE_TOKEN` to a Vercel Blob store.
3. **Chromium on the web host.** "Download PDF" (`/api/reports/:id/pdf`) launches Chromium from the web process. Install it with `npx playwright install --with-deps chromium`, using the Playwright version from `apps/worker/package.json`.
4. **Do not set `VERCEL` or `AWS_LAMBDA_FUNCTION_NAME`.** Either switches Chromium to the serverless build and disables local report storage.
5. **Don't buffer or cut short the audit request.** The app keeps the worker stream open for up to 150 seconds after answering the shopper.

## 1. Build

On the server, from the repository root (Node 22):

```bash
npm ci
```

```bash
npm run build --workspace=@cro/shared && npm run build --workspace=@cro/web
```

`NEXT_PUBLIC_*` values are baked in at build time, so set them (section 2) before building.

## 2. Environment

`/etc/cro-web.env`, readable by root only (`chmod 600`):

```
NODE_ENV=production
SITE_URL=https://audit.<domain>
WORKER_URL=http://127.0.0.1:8787
WORKER_TOKEN=<same token as /etc/cro-worker.env>
TRUST_PROXY=true
AUDIT_RATE_MAX_PER_IP=3
AUDIT_RATE_WINDOW_MS=3600000
AUDIT_DUPLICATE_WINDOW_MS=1800000
# Optional; defaults to the Monkeyman 30-minute call. Build-time.
NEXT_PUBLIC_CALENDLY_URL=
```

`TRUST_PROXY=true` (the default) makes the per-IP audit limit read the shopper's address from Caddy's `X-Forwarded-For`. Keep the app behind the proxy: reached directly, a shopper could set that header themselves and dodge the limit.

## 3. Run as a service

`/etc/systemd/system/cro-web.service`:

```
[Unit]
Description=CRO audit web app
After=network.target docker.service

[Service]
WorkingDirectory=/opt/CRO-agent/apps/web
EnvironmentFile=/etc/cro-web.env
ExecStart=/usr/bin/npm run start
Restart=always
User=cro

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now cro-web
```

`npm run start` listens on port 3000. The service user must own `apps/web/data/`.

## 4. HTTPS with Caddy

Point `audit.<domain>` at the server, then add to `/etc/caddy/Caddyfile`:

```
audit.<domain> {
	reverse_proxy 127.0.0.1:3000 {
		flush_interval -1
	}
}
```

```bash
sudo systemctl reload caddy
```

The worker needs no public address now: the web app reaches it on `127.0.0.1:8787`. You can drop its Caddy block and keep port 8787 bound to localhost only. Keep `WORKER_TOKEN` set anyway.

## 5. Verify

1. `https://audit.<domain>/` loads the landing page; `/book` shows the Calendly scheduler.
2. Run an audit from the landing page. Expect the "Live CRO audit in progress" overlay, then the unlock form.
3. Unlock the report; it should list findings with screenshots.
4. Click "Download PDF"; expect a PDF of the report.
5. `ls apps/web/data/reports` shows the new report.

## Updating

```bash
git pull && npm ci && npm run build --workspace=@cro/shared && npm run build --workspace=@cro/web && sudo systemctl restart cro-web
```

Rebuild the worker image as in [deploy-aws.md](deploy-aws.md#updating-and-rolling-back).
