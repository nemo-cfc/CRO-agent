// One-off: copies every lead the app has already saved into the Supabase
// `leads` table. Safe to re-run: rows are upserted on id.
//
// Reads from wherever the app keeps leads:
//   - Vercel Blob, when BLOB_READ_WRITE_TOKEN is set (the app uses Blob then);
//   - otherwise the files in data/leads/ on this server's disk.
//
//   cd apps/web
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-leads.mjs
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const url = process.env.SUPABASE_URL?.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const headers = { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' };
if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

const toRow = (l) => ({
  id: l.id,
  created_at: l.createdAt,
  source: l.reportId ? 'report_unlock' : 'landing',
  report_id: l.reportId ?? null,
  store_url: l.storeUrl,
  name: l.name,
  email: l.email,
  phone: l.phone || null,
  strategy_session: typeof l.strategySession === 'boolean' ? l.strategySession : null,
  intent: l.intent ?? null,
  gmv: l.gmv ?? null,
  budget: l.budget ?? null,
  urgency: l.urgency ?? null,
  route: l.route ?? null,
  privacy_notice_version: l.privacyNoticeVersion ?? null,
  raw: l,
});

let copied = 0;
async function send(leads) {
  if (!leads.length) return;
  const res = await fetch(`${url}/rest/v1/leads`, { method: 'POST', headers, body: JSON.stringify(leads.map(toRow)) });
  if (!res.ok) {
    console.error('Supabase rejected the batch:', res.status, await res.text());
    process.exit(1);
  }
  copied += leads.length;
  console.log(`copied ${copied} leads so far`);
}

if (process.env.BLOB_READ_WRITE_TOKEN) {
  console.log('Reading leads from Vercel Blob');
  const { get, list } = await import('@vercel/blob');
  let cursor;
  do {
    const page = await list({ prefix: 'leads/', cursor, limit: 500 });
    const leads = [];
    for (const blob of page.blobs) {
      const result = await get(blob.pathname, { access: 'private' });
      if (result) leads.push(JSON.parse(await new Response(result.stream).text()));
    }
    await send(leads);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
} else {
  const dir = path.resolve(process.cwd(), 'data', 'leads');
  console.log(`Reading leads from ${dir}`);
  let files = [];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    console.error(`No ${dir} folder: run this from apps/web on the server (or inside the web app's container).`);
    process.exit(1);
  }
  for (let i = 0; i < files.length; i += 500) {
    const leads = [];
    for (const f of files.slice(i, i + 500)) leads.push(JSON.parse(await readFile(path.join(dir, f), 'utf8')));
    await send(leads);
  }
}
console.log(`done: ${copied} leads copied to Supabase`);
