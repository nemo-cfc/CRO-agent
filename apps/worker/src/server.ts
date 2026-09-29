import Fastify from 'fastify';
import cors from '@fastify/cors';
import { timingSafeEqual } from 'node:crypto';
import { StartAuditRequestSchema } from '@cro/shared';
import { config } from './config.js';
import { pool } from './browser/pool.js';
import { createJob, getJob, queueDepth, subscribe } from './jobs.js';
import { assertPublicHost, normalizeUrl, validateProductUrl, UrlRejected } from './pipeline/url.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: 64 * 1024,
});

await app.register(cors, { origin: true });

// A hosted worker browses whatever URL it is given, so only the web app may
// start or read audits. /health stays open for the host's health check.
const expectedAuth = config.workerToken ? Buffer.from('Bearer ' + config.workerToken) : null;
app.addHook('onRequest', async (request, reply) => {
  if (!expectedAuth || request.url === '/health' || request.method === 'OPTIONS') return;
  const given = Buffer.from(request.headers.authorization ?? '');
  if (given.length !== expectedAuth.length || !timingSafeEqual(given, expectedAuth)) {
    return reply.code(401).send({ error: 'Unauthorized.' });
  }
});

// Load balancers restart the worker on a non-2xx: without a working Chromium
// every audit comes back empty, so a dead browser must fail the check.
app.get('/health', async (_request, reply) => {
  const ok = await pool.healthy();
  return reply.code(ok ? 200 : 503).send({
    ok,
    browser: pool.stats(),
    queue: queueDepth(),
    model: config.model,
    hasApiKey: config.groqApiKey.length > 0,
  });
});

app.post('/audit', async (request, reply) => {
  const parsed = StartAuditRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'Send a JSON body with a "url" field.' });
  }

  let url: URL; let productUrl: string | undefined;
  try {
    url = normalizeUrl(parsed.data.url);
    // The URL is user-supplied and this worker sits inside a private network.
    await assertPublicHost(url);
    productUrl = await validateProductUrl(url, parsed.data.productUrl);
  } catch (err) {
    if (err instanceof UrlRejected) return reply.code(400).send({ error: err.message });
    throw err;
  }

  const job = createJob(url.toString(), productUrl);
  return reply.code(202).send({ jobId: job.id, url: url.toString() });
});

app.get<{ Params: { id: string } }>('/audit/:id/stream', (request, reply) => {
  const job = getJob(request.params.id);
  if (!job) return reply.code(404).send({ error: 'Unknown or expired audit.' });

  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // Nginx buffers SSE by default, which turns progressive delivery into
    // one batch at the end. This header disables it.
    'x-accel-buffering': 'no',
    // Writing to reply.raw bypasses Fastify's onSend hooks, so @fastify/cors
    // never gets to add this — and a browser silently drops the whole stream
    // as a CORS failure. Node's fetch does not enforce CORS, so this is
    // invisible to server-side probes and only shows up in the real frontend.
    'access-control-allow-origin': request.headers.origin ?? '*',
    vary: 'Origin',
  });
  reply.raw.write(': connected\n\n');

  const send = (event: unknown) => {
    if (reply.raw.writableEnded) return;
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  let unsubscribe: () => void = () => {};
  unsubscribe = subscribe(job, (event) => {
    send(event);
    if (event.type === 'done') {
      unsubscribe();
      reply.raw.end();
    }
  });

  // Some proxies drop an idle connection well before a 25s audit finishes.
  const keepAlive = setInterval(() => {
    if (!reply.raw.writableEnded) reply.raw.write(': ping\n\n');
  }, 10_000);

  request.raw.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
  reply.raw.on('close', () => clearInterval(keepAlive));

  if (job.finished) {
    clearInterval(keepAlive);
    reply.raw.end();
  }
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await pool.close();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Warm the pool before accepting traffic — the whole latency argument rests
// on the first real request finding a browser already running.
app.log.info('warming browser pool…');
const warmStart = Date.now();
await pool.start();
app.log.info({ ms: Date.now() - warmStart, ...pool.stats() }, 'browser pool ready');

if (!config.groqApiKey) {
  app.log.warn('GROQ_API_KEY is not set — audits will return checks without written recommendations.');
}

await app.listen({ port: config.port, host: config.host });
