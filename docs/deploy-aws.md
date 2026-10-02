# Deploying the audit worker on AWS

This guide covers the **worker** (`apps/worker`), the service that opens a store in Chromium, measures it and writes the findings. The **web app** (`apps/web`) stays on Vercel and calls the worker through `WORKER_URL`.

```
Shopper ──> Vercel (apps/web) ──WORKER_URL + WORKER_TOKEN──> AWS (apps/worker + Chromium) ──> the store being audited
                 │
                 └── Vercel Blob (reports, leads, grants)
```

The recommended setup is **one small always-on server running the worker's Docker image**, for about **$12–15 a month**. It is sized for the expected load, audits from ad traffic, planned for up to 25 a day. On this server one audit takes about 60 seconds, so even 25 arriving in the same hour finish without queuing for long. Section 6 covers when to move to something bigger.

## Why an always-on server, not Lambda

The worker keeps one Chromium running and reuses it across audits. Each audit opens 3 pages on a phone and a desktop viewport, inside a measurement deadline of 90 seconds on a small server.

On a serverless function (Lambda, or a Vercel function), Chromium starts cold on every request and gets a small, capped amount of memory. Pages then fail to render. The worker falls back to raw-HTML checks, none of which the report publishes, and the shopper gets an empty report. That is what happened to the motoradds.com audit on 29 September 2026.

## Constraints you must respect

1. **Run exactly one worker.** Job state lives in memory. The web app starts an audit with `POST /audit`, then reads `GET /audit/:id/stream`. Both requests must reach the same process. Scale *up* (a bigger server), not *out*, until job state moves to Redis.
2. **The stream is long-lived.** `/audit/:id/stream` is server-sent events and stays open for the whole audit (about 60 seconds, at most 110). Any proxy in front must not buffer it, and must allow at least 120 seconds.
3. **Set `WORKER_TOKEN`.** Without it, anyone who finds the worker's address can make it browse arbitrary sites on your bill.

## 1. Server and settings

| | Start here | Step up if audits queue or `/health` fails |
|---|---|---|
| Server | Lightsail 2 GB (2 vCPU), or EC2 `t3.small` | Lightsail 4 GB, or EC2 `t3.medium` |
| Region | `ap-south-1` (Mumbai), if most audited stores and shoppers are in India | same |
| `POOL_SIZE` | `2` | `4` |
| `MAX_CONCURRENT_AUDITS` | `1` | `2` |
| `MAX_QUEUE_DEPTH` | `4` | `8` |
| `PAGE_CONCURRENCY` | `2` | `3` |
| `MOBILE_SCALE` | `2` | `2` |
| Capacity | ~50 audits an hour; later ones wait in the queue | ~100 an hour |

The code defaults (`POOL_SIZE=8`, 2 concurrent audits, all page loads at once, 20-second deadline) are sized for a development machine with plenty of CPU and memory. On a 2 GB server they make every report partial ("still loading" / "did not load in time"): five page loads start together, starve each other of CPU, and run out of time. `PAGE_CONCURRENCY=2` loads two pages at a time, most important first, and the longer deadlines below give each one room to finish. Tested on a single CPU core: two stores audited in full in 52–58 seconds, with every screenshot.

Add a 2 GB swap file on the server (step 3.2). It keeps a memory spike on a heavy product page from killing Chromium, at the cost of that one audit running slower.

## 2. Build the image

The Dockerfile is at `apps/worker/Dockerfile`. Build it from the **repository root**, because the worker depends on the `@cro/shared` workspace. Tag it with the git commit, so rolling back means running the previous tag.

**Keep Playwright versions in step.** The base image tag (`PLAYWRIGHT_VERSION` in the Dockerfile) must equal the `playwright-core` version in `apps/worker/package.json`. If they differ, the worker cannot find a matching Chromium and every audit fails. When you upgrade `playwright-core`, change both.

Two ways to get the image onto the server:

- **Build on the server (simplest, free).** Clone the repository on the server and run:

  ```bash
  docker build -f apps/worker/Dockerfile -t cro-worker:$(git rev-parse --short HEAD) .
  ```

- **Push to a registry.** Build on your machine or in CI and push to Amazon ECR (about $0.10 per GB per month) or GitHub Container Registry (free for private images within its limits), then `docker pull` on the server.

## 3. Set up the server

### 3.1 Create it

**Lightsail:** Create instance → Linux → Ubuntu 24.04 → the 2 GB plan. Attach a static IP (free while attached). In Networking, allow only ports 22 (SSH, ideally from your own IP), 80 and 443.

**EC2:** Ubuntu 24.04 on `t3.small`, 20 GB gp3 disk. Set **IMDSv2 required, hop limit 1** (see [Security](#security)). Use a security group allowing only 22 (your IP), 80 and 443.

### 3.2 Install Docker and add swap

```bash
curl -fsSL https://get.docker.com | sudo sh
```

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3.3 Environment file

Create `/etc/cro-worker.env`:

```
GROQ_API_KEY=<secret>
CRUX_API_KEY=<optional>
CRO_MODEL=openai/gpt-oss-120b
CRO_EFFORT=low
WORKER_TOKEN=<long random string>
POOL_SIZE=2
MAX_CONCURRENT_AUDITS=1
MAX_QUEUE_DEPTH=4
PAGE_CONCURRENCY=2
MOBILE_SCALE=2
AUDIT_DEADLINE_MS=90000
NAV_TIMEOUT_MS=30000
WRITE_DEADLINE_MS=110000
```

Generate the token with `openssl rand -hex 32`. Then make the file readable only by root:

```bash
sudo chmod 600 /etc/cro-worker.env
```

Do **not** set `AWS_LAMBDA_FUNCTION_NAME` or `VERCEL`. Either one switches the worker to the serverless Chromium build, which is not in the image. `PORT` (8787) and `HOST` (0.0.0.0) are already set in the image.

The web app waits up to 150 seconds for an audit (`apps/web/app/api/reports/route.ts`), so these deadlines fit inside it. Keep `WRITE_DEADLINE_MS` below 140000.

### 3.4 Run the worker

```bash
docker run -d --name cro-worker --restart unless-stopped --env-file /etc/cro-worker.env --shm-size=512m -p 127.0.0.1:8787:8787 cro-worker:<tag>
```

The port is bound to `127.0.0.1`, so the worker is reachable only through Caddy (next step).

### 3.5 Restart the worker when Chromium dies

`--restart unless-stopped` only restarts a container that *exits*. When Chromium cannot start, `/health` returns 503 and Docker marks the container `unhealthy`, but leaves it running. A one-line cron job closes that gap:

```bash
echo '* * * * * root [ "$(docker inspect -f {{.State.Health.Status}} cro-worker)" = unhealthy ] && docker restart cro-worker' | sudo tee /etc/cron.d/cro-worker-health
```

### 3.6 HTTPS with Caddy (free certificates)

Point a DNS record, for example `cro-worker.monkeyman.agency`, at the server's static IP. In Cloudflare, set the record to **DNS only** (grey cloud), so Caddy can obtain its certificate and the progress stream is not cut by Cloudflare's proxy. Install Caddy (`sudo apt install caddy`), then set `/etc/caddy/Caddyfile` to:

```
cro-worker.monkeyman.agency {
	reverse_proxy 127.0.0.1:8787 {
		flush_interval -1
	}
}
```

```bash
sudo systemctl reload caddy
```

Caddy obtains and renews a Let's Encrypt certificate automatically. `flush_interval -1` passes the audit stream through without buffering.

## 4. Connect the web app

In Vercel → Project → Settings → Environment Variables (Production), set both:

```
WORKER_URL=https://cro-worker.monkeyman.agency
WORKER_TOKEN=<the same token as on the server>
```

Then redeploy the web app. Without `WORKER_URL`, every audit fails with "fetch failed". With a missing or mismatched token, the worker answers 401 and the audit fails to start.

## 5. Verify the deployment

1. **Health.** Expect HTTP 200 and `"browser":{"connected":true,...}`. A 503 means Chromium could not start (see Troubleshooting).

   ```bash
   curl -s -w "\nHTTP %{http_code}\n" https://cro-worker.monkeyman.agency/health
   ```

2. **The token is enforced.** Expect `401`:

   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://cro-worker.monkeyman.agency/audit -H "Content-Type: application/json" -d '{"url":"https://motoradds.com/"}'
   ```

3. **One real audit through the worker.**

   ```bash
   curl -s -X POST https://cro-worker.monkeyman.agency/audit -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"url":"https://motoradds.com/"}'
   ```

   Take the `jobId` from the response and stream it:

   ```bash
   curl -N -H "Authorization: Bearer <token>" https://cro-worker.monkeyman.agency/audit/<jobId>/stream
   ```

   You should see `shot` events for each page, a `checks` event, then `done` with `"partial":false`.

4. **End to end.** Run an audit from the live site, unlock the report, and confirm it lists findings and measurements. Also check that it does not say "Part of this visit did not finish in time".

## 6. Costs, and when to move up

Approximate on-demand prices for Mumbai. Check the [AWS Pricing Calculator](https://calculator.aws/) before committing.

| Setup | Per month |
|---|---|
| **Lightsail 2 GB**: server, static IP and 3 TB transfer included | **~$12** |
| EC2 `t3.small` + 20 GB disk + public IP + a little data transfer | ~$15–20 |
| Lightsail 1 GB | ~$7, but not recommended: Chromium runs mostly in swap, audits slow down and may time out. That is the empty-report failure again, to save $5 |
| Lightsail 4 GB (the step-up) | ~$24 |
| A 1-year EC2 Savings Plan | about 30% off the EC2 rows |

HTTPS (Caddy), the token check and the health-restart cron cost nothing. Data transfer is small: store pages coming in are free, and results sent to Vercel are 1–3 MB per audit.

**Move to ECS Fargate with a load balancer (about $60–100 a month) only when you need** managed restarts without a cron job, no servers to patch, or more than one worker. The last one also needs job state in Redis first. The same Docker image runs there unchanged. Use a public subnet rather than a NAT gateway, which would add about $40 a month.

## Security

- **`WORKER_TOKEN`** is required on any worker reachable from the internet. The web app sends it as `Authorization: Bearer …`. `/health` is exempt so health checks work. Rotate it by changing it in both places.
- **Block the instance metadata service** (EC2). The worker browses user-supplied URLs. `assertPublicHost` refuses private and metadata addresses, but a DNS-rebinding trick could get past it. IMDSv2 with hop limit 1 stops containers reading instance credentials. Give the instance role no permissions beyond what it needs. Lightsail instances have no IAM role to steal.
- **Keep the firewall tight:** 22 from your IP only; 80 and 443 open; nothing else.
- **Patch the server.** Enable unattended upgrades: `sudo apt install unattended-upgrades`.
- **Rotate secrets** if they have ever been pasted into chat, tickets or logs.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` returns 503 | Chromium cannot start: version mismatch, or out of memory | `docker logs cro-worker`. Confirm `PLAYWRIGHT_VERSION` equals `playwright-core`. Check swap is on (`free -h`) |
| Every report says part of the visit did not finish ("still loading" or "did not load in time") | Not enough CPU for the page loads within the deadline | Set `PAGE_CONCURRENCY=2`, `AUDIT_DEADLINE_MS=90000`, `NAV_TIMEOUT_MS=30000`, `WRITE_DEADLINE_MS=110000`. Check the Lightsail CPU graph: if it sits in the burstable zone, burst capacity is used up; step up a plan |
| Report says "We could not open … in our browser" | No page rendered in time | Check the logs for navigation timeouts. Raise `NAV_TIMEOUT_MS`. On `t3` instances, check CPU credits are not exhausted |
| Every audit fails to start; worker log shows 401 | `WORKER_TOKEN` differs between Vercel and the server | Set the same value in both; redeploy the web app |
| Every audit fails with "fetch failed" | `WORKER_URL` missing on Vercel, or DNS/HTTPS not ready | Set it; check `curl https://cro-worker.monkeyman.agency/health` |
| Audits hang, then fail at 150 s | The proxy buffers the stream | Caddy: `flush_interval -1`. nginx: `proxy_buffering off; proxy_read_timeout 120s;` |
| Audits wait a long time before starting | The queue is full at `MAX_CONCURRENT_AUDITS=1` | Step up one size and raise it to 2 |
| Screenshots show a challenge page ("Verify you are human") | The store's CDN challenges data-centre IPs | Not detected yet. Consider a residential or ISP proxy for egress |

## Updating and rolling back

1. Build or pull the new image tag (section 2).
2. Replace the container:

   ```bash
   docker stop cro-worker && docker rm cro-worker
   ```

   Then re-run the `docker run` command from 3.4 with the new tag.
3. **Roll back** by running the previous tag the same way.

`docker logs cro-worker` holds each request and the browser pool's start-up line (`browser pool ready`, with whether Chromium connected). It is the first place to look when a report comes back empty.
