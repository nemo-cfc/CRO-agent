import { NextRequest } from 'next/server';
import type { AuditEvent } from '@cro/shared';
import { runAudit } from '../../../../worker/src/pipeline/run.js';
import { assertPublicHost, normalizeUrl, validateProductUrl, UrlRejected } from '../../../../worker/src/pipeline/url.js';

// Chromium needs the Node runtime; the edge runtime cannot launch a process.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Hobby's ceiling. The audit's own deadline is well inside this — the margin
// is for cold start plus Chromium launch, which the local worker never pays.
export const maxDuration = 60;

/**
 * The audit as a single streaming request.
 *
 * The standalone worker splits this in two: POST creates a job, then a
 * separate GET subscribes to its event stream. That relies on both requests
 * reaching the same process, because the job registry is an in-memory Map —
 * true for one long-lived worker, false for serverless, where the two calls
 * routinely land on different instances and the GET would 404 every time.
 *
 * Streaming the response from the POST itself removes the shared state
 * entirely: one request, one instance, events written as they happen.
 */
export async function POST(request: NextRequest) {
  let target: URL; let productUrl: string | undefined;
  try {
    const body = (await request.json()) as { url?: string; productUrl?: string };
    target = normalizeUrl(body.url ?? '');
    // The URL is user-supplied and this function has outbound network access.
    await assertPublicHost(target);
    productUrl = await validateProductUrl(target, body.productUrl);
  } catch (err) {
    const message = err instanceof UrlRejected ? err.message : 'Send a JSON body with a "url" field.';
    return Response.json({ error: message }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: AuditEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };

      try {
        await runAudit(target.toString(), send, productUrl);
      } catch (err) {
        send({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
          recoverable: false,
          at: 0,
        });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          /* already closed by the client disconnecting */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
