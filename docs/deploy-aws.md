# Deploying the audit worker on AWS

This guide covers the **worker** (`apps/worker`), the service that opens a store in Chromium, measures it and writes the findings. The **web app** (`apps/web`) stays on Vercel and calls the worker through `WORKER_URL`.

```
Shopper ──> Vercel (apps/web) ──WORKER_URL──> AWS (apps/worker + Chromium) ──> the store being audited
                 │
                 └── Vercel Blob (reports, leads, grants)
```

## Why a long-running container, not Lambda

The worker keeps one Chromium running and a pool of pre-opened browser tabs, and reuses them across audits. Each audit opens 3 pages on a phone and a desktop viewport, so 6 page loads, inside a deadline of about 35 seconds.

On a serverless function (Lambda, or a Vercel function), Chromium starts cold on every request and gets a small, capped amount of memory. Pages then fail to render. The worker falls back to raw-HTML checks, none of which the report publishes, and the shopper gets an empty report. That is what happened to the motoradds.com audit on 29 September 2026.

**Run the worker as a container that stays up.** The two supported options are:

| | ECS on Fargate + load balancer (recommended) | Single EC2 instance |
|---|---|---|
| Restarts a failed worker | Yes, from the health check | Only through Docker's restart policy |
| HTTPS | Load balancer + ACM certificate | You set up nginx/Caddy + a certificate |
| Operating system patches | AWS | You |
| Effort | Medium | Low |

## Constraints you must respect

1. **Run exactly one worker task.** Job state lives in memory. The web app starts an audit with `POST /audit`, then reads `GET /audit/:id/stream`. With two tasks behind a load balancer, the second request can reach a task that has never heard of the job. Scale *up* (a larger task, a higher `MAX_CONCURRENT_AUDITS`), not *out*, until job state moves to Redis.
2. **The stream is long-lived.** `/audit/:id/stream` is server-sent events and stays open for the whole audit (up to about 45 seconds). Set the load balancer's idle timeout to **120 seconds**.
3. **The worker has no authentication.** Anyone who can reach it can make it browse arbitrary sites. See [Security](#security) before exposing it.

## 1. Sizing and region

| Setting | Value |
|---|---|
| Region | `ap-south-1` (Mumbai), if most audited stores and shoppers are in India |
| Fargate task | 2 vCPU, 4 GB memory (for `MAX_CONCURRENT_AUDITS=2`) |
| EC2 instance | `t3.medium` minimum; `c6i.large` for steadier timings |
| More concurrency | 8 GB memory for `MAX_CONCURRENT_AUDITS=4` |
| Architecture | `linux/amd64` (the Playwright image's Chromium is x86-64) |

Chromium uses roughly 150–300 MB per open tab. `POOL_SIZE=8` keeps 8 tabs warm, and a busy product page can double that.

## 2. Build and push the image

The Dockerfile is at `apps/worker/Dockerfile`. Build it from the **repository root**, because the worker depends on the `@cro/shared` workspace.

```bash
aws ecr create-repository --repository-name cro-worker --region ap-south-1
```

```bash
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.ap-south-1.amazonaws.com
```

```bash
docker build --platform linux/amd64 -f apps/worker/Dockerfile -t <account-id>.dkr.ecr.ap-south-1.amazonaws.com/cro-worker:<git-sha> .
```

```bash
docker push <account-id>.dkr.ecr.ap-south-1.amazonaws.com/cro-worker:<git-sha>
```

Tag images with the git commit SHA, not `latest`, so a rollback is a redeploy of the previous tag.

**Keep Playwright versions in step.** The base image tag (`PLAYWRIGHT_VERSION` in the Dockerfile) must equal the `playwright-core` version in `apps/worker/package.json`. If they differ, the worker cannot find a matching Chromium and every audit fails. When you upgrade `playwright-core`, change both.

## 3. Environment variables

Store secrets (`GROQ_API_KEY`, `CRUX_API_KEY`) in **AWS Secrets Manager** or **SSM Parameter Store**, and reference them from the task definition. Never put them in the image.

| Variable | Hosted value | Notes |
|---|---|---|
| `GROQ_API_KEY` | *(secret)* | Required for written recommendations |
| `CRUX_API_KEY` | *(secret, optional)* | Real-user speed data |
| `CRO_MODEL` | `openai/gpt-oss-120b` | |
| `CRO_EFFORT` | `low` | |
| `PORT` | `8787` | Set in the image |
| `HOST` | `0.0.0.0` | Set in the image |
| `POOL_SIZE` | `8` | Warm tabs; each audit borrows 4 |
| `MAX_CONCURRENT_AUDITS` | `2` | Raise only with more memory |
| `MAX_QUEUE_DEPTH` | `8` | Beyond this, `/audit` refuses new work |
| `AUDIT_DEADLINE_MS` | `35000` | Code default 20000 is tuned for a fast local machine |
| `NAV_TIMEOUT_MS` | `20000` | Code default 12000 |
| `WRITE_DEADLINE_MS` | `45000` | Code default 28000 |

Do **not** set `AWS_LAMBDA_FUNCTION_NAME` or `VERCEL` on the container. Either one switches the worker to the serverless Chromium build, which is not in the image.

The web app waits up to 150 seconds for an audit (`apps/web/app/api/reports/route.ts`), so these deadlines leave plenty of room.

## 4a. Option A: ECS on Fargate (recommended)

1. **Cluster.** Create an ECS cluster (Fargate) in `ap-south-1`.
2. **Task definition.**
   - Launch type Fargate, `linux/amd64`, 2 vCPU / 4 GB.
   - Container `cro-worker`, image from ECR, port mapping `8787/tcp`.
   - Environment and secrets as in section 3.
   - Logging: `awslogs` driver, log group `/ecs/cro-worker`.
   - Container health check (mirrors the Dockerfile):
     `CMD-SHELL, node -e "fetch('http://127.0.0.1:8787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`
     Interval 30 s, timeout 15 s, retries 3, start period 60 s.
3. **Target group.**
   - Target type `ip`, protocol HTTP, port 8787.
   - Health check path `/health`, success codes `200`.
   - Interval 30 s, timeout 15 s, healthy threshold 2, unhealthy threshold 3.
   - Deregistration delay 60 s, so an in-flight audit can finish during a deploy.
4. **Application Load Balancer.**
   - HTTPS listener on 443 with an ACM certificate, for example `worker.<your-domain>`, forwarding to the target group.
   - Redirect HTTP 80 to 443.
   - **Idle timeout 120 s** (Attributes → Idle timeout).
5. **Service.**
   - Desired count **1**, with autoscaling **off** (see Constraints).
   - Deployment: minimum healthy 0 %, maximum 100 %. Two tasks must never be live together.
   - Networking: private subnets with a NAT gateway for outbound access, or public subnets with a public IP.
6. **DNS.** Point `worker.<your-domain>` at the load balancer (Route 53 alias record).

## 4b. Option B: a single EC2 instance

1. **Launch the instance.**
   - Ubuntu 24.04 on `t3.medium` or larger, 20 GB gp3 disk.
   - Require **IMDSv2 with hop limit 1** (see [Security](#security)).
   - Attach an IAM role that allows ECR pulls and reading the worker's secrets.
2. **Install Docker and the AWS CLI**, then log in to ECR as in section 2.
3. **Put the variables in `/etc/cro-worker.env`**, readable only by root:

   ```bash
   sudo chmod 600 /etc/cro-worker.env
   ```

4. **Run the container.**

   ```bash
   docker run -d --name cro-worker --restart unless-stopped --env-file /etc/cro-worker.env --shm-size=1g -p 127.0.0.1:8787:8787 <account-id>.dkr.ecr.ap-south-1.amazonaws.com/cro-worker:<git-sha>
   ```

   - `--restart unless-stopped` only restarts a container that *exits*. A container whose health check turns unhealthy keeps running, so either add a cron job that restarts it when `docker inspect` reports `unhealthy`, or use Option A.
   - `--shm-size=1g` gives Chromium shared memory. The worker also launches with `--disable-dev-shm-usage`, so this is belt and braces.
5. **Put Caddy or nginx in front for HTTPS** on 443, proxying to `127.0.0.1:8787`.
   - Disable response buffering on `/audit/` paths (nginx: `proxy_buffering off;`).
   - Set `proxy_read_timeout 120s;`.

## 5. Connect the web app

In Vercel → Project → Settings → Environment Variables (Production), set:

```
WORKER_URL=https://worker.<your-domain>
```

Then redeploy the web app. Without `WORKER_URL`, the web app calls `http://localhost:8787` and every audit fails with "fetch failed".

## 6. Verify the deployment

1. **Health.** Expect HTTP 200 and `"browser":{"connected":true,...}`:

   ```bash
   curl -s -w "\nHTTP %{http_code}\n" https://worker.<your-domain>/health
   ```

   A 503 means Chromium could not start. Check the logs (see Troubleshooting).
2. **One real audit through the worker.**

   ```bash
   curl -s -X POST https://worker.<your-domain>/audit -H "Content-Type: application/json" -d '{"url":"https://motoradds.com/"}'
   ```

   Take the `jobId` from the response and stream it:

   ```bash
   curl -N https://worker.<your-domain>/audit/<jobId>/stream
   ```

   You should see `shot` events for each page, a `checks` event, then `done` with `"partial":false`.
3. **End to end.** Run an audit from the live site, unlock the report, and confirm it lists findings and measurements. Also check that it does not say "Part of this visit did not finish in time".

## Security

- **Restrict who can call the worker.** It has no authentication today, and Vercel's outbound IP addresses are not fixed, so an IP allowlist is not practical. Until a shared-secret header is added (worker checks it, web sends it), keep the worker's hostname unlisted, and add AWS WAF rate limiting on the load balancer (for example 30 requests per 5 minutes per IP).
- **Block the instance metadata service.** The worker browses user-supplied URLs. `assertPublicHost` refuses private and metadata addresses, but a DNS-rebinding trick could get past it. On EC2, require IMDSv2 with hop limit 1 so containers cannot read instance credentials. Fargate does not expose the EC2 metadata service. Give the task role only the permissions it needs, which is none beyond logging and secrets.
- **Restrict outbound traffic.** Allow outbound 80/443 to the internet only. Deny outbound access to the VPC's own ranges from the worker's security group, so it cannot reach internal services.
- **Rotate secrets** if they have ever been pasted into chat, tickets or logs.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/health` returns 503 | Chromium cannot start: version mismatch, or out of memory | Check the logs for `browserType.launch`. Confirm `PLAYWRIGHT_VERSION` equals `playwright-core`. Add memory |
| Report says "We could not open … in our browser" | No page rendered in time | Check the logs for navigation timeouts. Raise `NAV_TIMEOUT_MS`. Confirm the task is not CPU-starved |
| Reports marked partial with "still loading" notes | The site is slow from this region | Expected on heavy sites. Raise `AUDIT_DEADLINE_MS` if frequent |
| Audits hang, then fail at 150 s | Load balancer idle timeout too low, or proxy buffering the stream | Idle timeout 120 s; turn buffering off on the proxy |
| "Unknown or expired audit." (404) on the stream | More than one worker task | Set desired count to 1 |
| Every audit fails with "fetch failed" | `WORKER_URL` missing on Vercel | Set it and redeploy the web app |
| Screenshots show a challenge page ("Verify you are human") | The store's CDN challenges data-centre IPs | Not detected yet. Consider a residential or ISP proxy for egress |
| Task restarts in a loop | Health check fails during start-up | Raise the health check start period to 90 s |

## Deploying updates and rolling back

1. Merge to `main`, build and push a new image tagged with the commit SHA.
2. ECS: update the service to the new task definition revision. EC2: `docker pull` the new tag, then stop, remove and re-run the container.
3. **Roll back** by redeploying the previous SHA tag.

Keep CloudWatch log retention at 14–30 days. The logs record each request to the worker and the browser pool's start-up (`browser pool ready`, with whether Chromium connected), and they are the first place to look when a report comes back empty.
