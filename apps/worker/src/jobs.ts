import { randomUUID } from 'node:crypto';
import type { AuditEvent } from '@cro/shared';
import { config } from './config.js';
import { runAudit } from './pipeline/run.js';

type Subscriber = (event: AuditEvent) => void;

interface Job {
  id: string;
  url: string;
  createdAt: number;
  /**
   * Every event so far. The client POSTs and *then* opens the stream, so
   * without a replay buffer the first second of events is lost to the race.
   */
  events: AuditEvent[];
  subscribers: Set<Subscriber>;
  finished: boolean;
}

const jobs = new Map<string, Job>();

/* Simple semaphore. A prototype running two audits against a pool of eight
 * contexts; past that, requests queue rather than thrashing the browser. */
let active = 0;
const waiting: (() => void)[] = [];

export class QueueFull extends Error {
  constructor() {
    super('The audit queue is full. Try again in a moment.');
  }
}

function acquireSlot(): Promise<void> {
  if (active < config.maxConcurrentAudits) {
    active++;
    return Promise.resolve();
  }
  if (waiting.length >= config.maxQueueDepth) return Promise.reject(new QueueFull());
  return new Promise((resolve) => waiting.push(resolve));
}

function releaseSlot(): void {
  const next = waiting.shift();
  if (next) next();
  else active--;
}

export function queueDepth(): { active: number; waiting: number } {
  return { active, waiting: waiting.length };
}

export function createJob(url: string, productUrl?: string): Job {
  const job: Job = {
    id: randomUUID(),
    url,
    createdAt: Date.now(),
    events: [],
    subscribers: new Set(),
    finished: false,
  };
  jobs.set(job.id, job);

  const emit = (event: AuditEvent) => {
    job.events.push(event);
    if (event.type === 'done') job.finished = true;
    for (const sub of job.subscribers) {
      try {
        sub(event);
      } catch {
        /* a dead connection must not stop the audit */
      }
    }
  };

  emit({ type: 'phase', phase: 'queued', label: 'Starting', at: 0 });

  void (async () => {
    try {
      await acquireSlot();
      await runAudit(url, emit, productUrl);
    } catch (err) {
      if (err instanceof QueueFull) {
        emit({ type: 'error', message: err.message, recoverable: true, at: 0 });
      } else {
        emit({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
          recoverable: false,
          at: 0,
        });
      }
      emit({ type: 'done', durationMs: Date.now() - job.createdAt, partial: true, notes: [], at: 0 });
    } finally {
      releaseSlot();
      // Reports are ephemeral in the prototype; hold them long enough for a
      // reconnect, then let them go.
      setTimeout(() => jobs.delete(job.id), 10 * 60_000).unref?.();
    }
  })();

  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/** Replay everything so far, then stream the rest. Returns an unsubscribe fn. */
export function subscribe(job: Job, sub: Subscriber): () => void {
  for (const event of job.events) sub(event);
  if (job.finished) return () => {};
  job.subscribers.add(sub);
  return () => job.subscribers.delete(sub);
}
