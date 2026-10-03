import 'server-only';

/**
 * Copies each lead to Supabase (backup) and Zoho CRM (sales follow-up).
 *
 * Vercel Blob stays the primary store: these run after the response, and a
 * failure here is logged, never shown to the shopper. Each target is skipped
 * when its environment variables are not set.
 */

export type LeadRecord = {
  id: string;
  createdAt: string;
  source: 'landing' | 'report_unlock';
  reportId?: string | null;
  storeUrl: string;
  name: string;
  email: string;
  phone: string;
  strategySession?: boolean | null;
  intent?: string | null;
  gmv?: string | null;
  budget?: string | null;
  urgency?: string | null;
  route?: string | null;
  privacyNoticeVersion?: string | null;
};

const TIMEOUT_MS = 8000;

export async function syncLead(lead: LeadRecord): Promise<void> {
  await backupToSupabase(lead);
  const zohoId = await pushToZoho(lead);
  if (zohoId) await markZohoId(lead.id, zohoId);
}

/* ----------------------------- Supabase ----------------------------- */

function supabase() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // Legacy service_role keys are JWTs and also go in Authorization; the newer
  // sb_secret_ keys go in the apikey header only.
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  return { rest: `${url}/rest/v1`, headers };
}

async function backupToSupabase(lead: LeadRecord) {
  const db = supabase();
  if (!db) return;
  const row = {
    id: lead.id,
    created_at: lead.createdAt,
    source: lead.source,
    report_id: lead.reportId ?? null,
    store_url: lead.storeUrl,
    name: lead.name,
    email: lead.email,
    phone: lead.phone || null,
    strategy_session: lead.strategySession ?? null,
    intent: lead.intent ?? null,
    gmv: lead.gmv ?? null,
    budget: lead.budget ?? null,
    urgency: lead.urgency ?? null,
    route: lead.route ?? null,
    privacy_notice_version: lead.privacyNoticeVersion ?? null,
    raw: lead,
  };
  try {
    const res = await fetch(`${db.rest}/leads`, {
      method: 'POST',
      headers: { ...db.headers, Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.error('[lead-sync] Supabase backup failed:', res.status, (await res.text()).slice(0, 300));
  } catch (error) {
    console.error('[lead-sync] Supabase backup failed:', error instanceof Error ? error.message : error);
  }
}

async function markZohoId(leadId: string, zohoId: string) {
  const db = supabase();
  if (!db) return;
  try {
    const res = await fetch(`${db.rest}/leads?id=eq.${encodeURIComponent(leadId)}`, {
      method: 'PATCH',
      headers: { ...db.headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ zoho_lead_id: zohoId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.error('[lead-sync] Supabase Zoho-id update failed:', res.status);
  } catch (error) {
    console.error('[lead-sync] Supabase Zoho-id update failed:', error instanceof Error ? error.message : error);
  }
}

/* ------------------------------ Zoho CRM ----------------------------- */

let zohoToken: { value: string; expires: number } | null = null;

function zohoConfig() {
  const { ZOHO_ACCOUNTS_URL, ZOHO_API_URL, ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN } = process.env;
  if (!ZOHO_ACCOUNTS_URL || !ZOHO_API_URL || !ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) return null;
  return {
    accounts: ZOHO_ACCOUNTS_URL.replace(/\/+$/, ''), api: ZOHO_API_URL.replace(/\/+$/, ''),
    clientId: ZOHO_CLIENT_ID, clientSecret: ZOHO_CLIENT_SECRET, refreshToken: ZOHO_REFRESH_TOKEN,
    /** API name of the target module: `Leads`, or a custom one such as `monkeyman_paid_leads`. */
    module: process.env.ZOHO_MODULE?.trim() || 'Leads',
  };
}

let zohoFieldCache: { module: string; names: Set<string> } | null = null;

/** Field API names of the target module, or null when they cannot be read. */
async function zohoFields(cfg: NonNullable<ReturnType<typeof zohoConfig>>, token: string): Promise<Set<string> | null> {
  if (zohoFieldCache?.module === cfg.module) return zohoFieldCache.names;
  try {
    const res = await fetch(`${cfg.api}/crm/v8/settings/fields?module=${encodeURIComponent(cfg.module)}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as { fields?: { api_name?: string }[] };
    if (!res.ok || !json.fields) {
      console.error('[lead-sync] Zoho field list failed:', res.status, '- sending all fields');
      return null;
    }
    zohoFieldCache = { module: cfg.module, names: new Set(json.fields.map((f) => f.api_name).filter((n): n is string => !!n)) };
    return zohoFieldCache.names;
  } catch (error) {
    console.error('[lead-sync] Zoho field list failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

async function zohoAccessToken(cfg: NonNullable<ReturnType<typeof zohoConfig>>): Promise<string | null> {
  if (zohoToken && zohoToken.expires > Date.now()) return zohoToken.value;
  const body = new URLSearchParams({ refresh_token: cfg.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token' });
  const res = await fetch(`${cfg.accounts}/oauth/v2/token`, { method: 'POST', body, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    console.error('[lead-sync] Zoho token refresh failed:', res.status, json.error ?? '');
    return null;
  }
  // Refresh a few minutes early; Zoho access tokens last an hour.
  zohoToken = { value: json.access_token, expires: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 300) * 1000 };
  return zohoToken.value;
}

const LABELS: Record<string, string> = {
  build: 'New store / first Shopify build', redesign: 'Redesign', scale: 'Scale - CRO, apps, retention', plus: 'Shopify Plus / multi-region / B2B',
  pre: 'Not live / pre-revenue', 'under-5k': 'Under $5k', '5-20k': '$5k-$20k', '20-50k': '$20k-$50k', '50-100k': '$50k-$100k', '100k-plus': '$100k+',
  exploring: 'Exploring / not budgeted', 'under-2k': 'Under $2,000', '2-5k': '$2,000-$5,000', '5-15k': '$5,000-$15,000', '15k-plus': '$15,000+',
  asap: 'This month', '30-60': '30-60 days', quarter: 'This quarter', research: 'Researching only',
};
const label = (v?: string | null) => (v ? LABELS[v] ?? v : '-');

async function pushToZoho(lead: LeadRecord): Promise<string | null> {
  const cfg = zohoConfig();
  if (!cfg) return null;
  try {
    const token = await zohoAccessToken(cfg);
    if (!token) return null;
    const parts = lead.name.trim().split(/\s+/);
    const lastName = parts.length > 1 ? parts.pop()! : parts[0]!;
    let company = lead.storeUrl;
    try { company = new URL(lead.storeUrl).hostname.replace(/^www\./, ''); } catch { /* keep the URL */ }
    const site = process.env.SITE_URL?.replace(/\/+$/, '');
    const contactOk = lead.source === 'landing' || lead.strategySession === true;
    const description = [
      `Source: ${lead.source === 'landing' ? 'Landing page form' : 'Report unlock form'}`,
      `Strategy session requested: ${lead.strategySession === true ? 'Yes' : lead.strategySession === false ? 'No' : '-'}`,
      contactOk ? null : 'Do not contact for sales: the shopper only unlocked their report and declined a strategy session.',
      `Store: ${lead.storeUrl}`,
      `Needs: ${label(lead.intent)}`,
      `Monthly sales: ${label(lead.gmv)}`,
      `Budget: ${label(lead.budget)}`,
      `Timing: ${label(lead.urgency)}`,
      lead.route ? `Routing: ${lead.route}` : null,
      lead.reportId && site ? `Report: ${site}/reports/${lead.reportId}` : null,
      `Lead id: ${lead.id}`,
    ].filter(Boolean).join('\n');
    // The standard Leads module needs Last_Name and Company; a custom module
    // (e.g. "Monkeyman Paid Leads") names its record with `Name` instead.
    const standard = cfg.module === 'Leads';
    const record: Record<string, string | undefined> = {
      ...(standard
        ? { First_Name: parts.length ? parts.join(' ') : undefined, Last_Name: lastName, Company: company }
        : { Name: lead.name }),
      Email: lead.email,
      Phone: lead.phone || undefined,
      Website: lead.storeUrl,
      Lead_Source: process.env.ZOHO_LEAD_SOURCE || 'CRO Audit',
      Description: description,
    };
    // Only send fields the module has: a custom module may lack Phone,
    // Website or Lead_Source, and Zoho rejects unknown or invalid values.
    const known = await zohoFields(cfg, token);
    if (known) {
      const dropped = Object.keys(record).filter((k) => record[k] !== undefined && !known.has(k));
      for (const k of dropped) delete record[k];
      if (dropped.length) console.warn(`[lead-sync] Zoho module ${cfg.module} has no field(s): ${dropped.join(', ')}`);
    }
    const res = await fetch(`${cfg.api}/crm/v8/${encodeURIComponent(cfg.module)}/upsert`, {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      // Leads de-duplicates on Email; a custom module uses the fields marked
      // "Do not allow duplicate values" in its layout.
      body: JSON.stringify(standard ? { data: [record], duplicate_check_fields: ['Email'] } : { data: [record] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { code?: string; message?: string; details?: { id?: string } }[] };
    const result = json.data?.[0];
    if (!res.ok || result?.code !== 'SUCCESS' || !result.details?.id) {
      console.error('[lead-sync] Zoho upsert failed:', res.status, result?.code ?? '', result?.message ?? '');
      return null;
    }
    return result.details.id;
  } catch (error) {
    console.error('[lead-sync] Zoho upsert failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
