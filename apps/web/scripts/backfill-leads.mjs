// One-off: copies every lead already in Vercel Blob into the Supabase `leads`
// table. Safe to re-run: rows are upserted on id.
//
//   cd apps/web
//   BLOB_READ_WRITE_TOKEN=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/backfill-leads.mjs
import { get, list } from '@vercel/blob';

const url = process.env.SUPABASE_URL?.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error('Set BLOB_READ_WRITE_TOKEN, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
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

let cursor;
let copied = 0;
do {
  const page = await list({ prefix: 'leads/', cursor, limit: 500 });
  const rows = [];
  for (const blob of page.blobs) {
    const result = await get(blob.pathname, { access: 'private' });
    if (!result) continue;
    rows.push(toRow(JSON.parse(await new Response(result.stream).text())));
  }
  if (rows.length) {
    const res = await fetch(`${url}/rest/v1/leads`, { method: 'POST', headers, body: JSON.stringify(rows) });
    if (!res.ok) {
      console.error('Supabase rejected the batch:', res.status, await res.text());
      process.exit(1);
    }
    copied += rows.length;
    console.log(`copied ${copied} leads so far`);
  }
  cursor = page.hasMore ? page.cursor : undefined;
} while (cursor);
console.log(`done: ${copied} leads copied to Supabase`);
