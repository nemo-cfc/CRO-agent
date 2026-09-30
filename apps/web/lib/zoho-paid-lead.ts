/*
 * Sends an unlocked-report lead to Zoho CRM's `monkeyman_paid_leads` module,
 * through the same public WebForm ("Monkeyman.agency — Paid LP Leads",
 * webform 1268939000001740001) the monkeyman.agency /la/ paid landing pages
 * post to. The mapping mirrors src/components/forms/laLeadBridge.ts in the
 * monkeyman_agency repo, so audit leads sit beside the other paid leads.
 *
 * Browser-side on purpose, like the /la/ pages: the WebForm tokens are public
 * (Zoho prints them in the embed code), and a hidden-iframe POST needs no
 * server credentials. Only hosts in NEXT_PUBLIC_ZOHO_ALLOWED_HOSTS send real
 * leads; everywhere else logs the payload, so testing never writes to the CRM.
 */
import { choices } from './lead';

const ZOHO_PAID_FORM = {
  action: 'https://crm.zoho.in/crm/WebForm',
  actionType: 'Q3VzdG9tTW9kdWxlMg==', // base64 of "CustomModule2"
  returnURL: 'https://monkeyman.agency',
  // From Zoho's embed code for the paid webform; set per deployment. Re-copy both if the webform is edited.
  xnQsjsdp: process.env.NEXT_PUBLIC_ZOHO_PAID_FORM_ID ?? '',
  xmIwtLD: process.env.NEXT_PUBLIC_ZOHO_PAID_FORM_KEY ?? '',
};

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;
const UTM_STORAGE_KEY = 'mm_attribution_session';
const GCLID_STORAGE_KEY = 'mm_gclid';
const LANDING_STORAGE_KEY = 'mm_landing_url';

/**
 * Remember the ad click (UTMs, gclid, landing URL) from the first page view,
 * so the lead still carries it when the report is unlocked a few pages later.
 */
export function captureAttribution(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const utms: Record<string, string> = {};
    for (const key of UTM_KEYS) { const value = params.get(key); if (value) utms[key] = value; }
    if (Object.keys(utms).length) sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utms));
    const gclid = params.get('gclid');
    if (gclid) sessionStorage.setItem(GCLID_STORAGE_KEY, gclid);
    if (!sessionStorage.getItem(LANDING_STORAGE_KEY) || Object.keys(utms).length || gclid) sessionStorage.setItem(LANDING_STORAGE_KEY, window.location.href);
  } catch {
    /* storage disabled: attribution degrades to direct */
  }
}

function stored(key: string): string {
  try { return sessionStorage.getItem(key) ?? ''; } catch { return ''; }
}

function storedUtms(): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  try { return JSON.parse(stored(UTM_STORAGE_KEY) || '{}'); } catch { return {}; }
}

const label = (key: keyof typeof choices, value: string | null | undefined) => choices[key].find(([id]) => id === value)?.[1] ?? '';
const cap = (value: string, max: number) => (value.length > max ? value.slice(0, max) : value);

/** The contact details and answers from the report's unlock form. */
export interface UnlockLead {
  name: string;
  email: string;
  phone: string;
  storeUrl: string | null;
  reportId: string;
  strategySession: boolean | null;
  intent: string;
  gmv: string;
  budget: string;
  urgency: string;
  /** Checks the audit failed, for the rep's context. */
  failedChecks: string[];
}

type Stage = { stage: 'store'; storeUrl: string } | ({ stage: 'unlock' } & UnlockLead);

const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

/**
 * The module needs a name and an email, which a visitor who has only typed a
 * store address has not given. These stand in, derived from the store, on a
 * reserved `.invalid` domain that can never receive mail.
 */
const placeholderName = (storeUrl: string) => `CRO audit – ${hostOf(storeUrl)}`;
const placeholderEmail = (storeUrl: string) => `${hostOf(storeUrl).replace(/[^a-z0-9.-]/gi, '')}@cro-audit.invalid`;

/** Map a lead onto the paid WebForm's field params (COBJ2CF*). */
function toPaidFields(lead: Stage): Record<string, string> {
  const utms = storedUtms();
  const cta = lead.stage === 'store' ? 'cro_audit_store' : 'cro_audit_unlock';
  const source = new URL(stored(LANDING_STORAGE_KEY) || window.location.href);
  source.searchParams.set('cta_id', cta);

  // What's Ready (255): category, stage, qualifiers and attribution, as on the /la/ pages.
  const quals = ['[Cat: CRO Audit]', lead.stage === 'store' ? '[Stage: store entered, no contact details]' : '[Stage: report unlocked]'];
  if (lead.stage === 'unlock') {
    if (lead.strategySession !== null) quals.push(`[Strategy call: ${lead.strategySession ? 'yes' : 'no'}]`);
    const help = label('intent', lead.intent), gmv = label('gmv', lead.gmv), budget = label('budget', lead.budget), start = label('urgency', lead.urgency);
    if (help) quals.push(`[Help: ${help}]`);
    if (gmv) quals.push(`[Sales: ${gmv}]`);
    if (budget) quals.push(`[Budget: ${budget}]`);
    if (start) quals.push(`[Start: ${start}]`);
  }
  if (utms.utm_source) quals.push(`[src: ${utms.utm_source}]`);
  if (utms.utm_campaign) quals.push(`[camp: ${utms.utm_campaign}]`);
  quals.push(`[CTA: ${cta}]`);

  // Biggest Symptom: where the visitor got to and, once audited, what the audit found.
  const symptom = lead.stage === 'store'
    ? `Entered ${lead.storeUrl} in the free CRO audit. Contact details not given yet; the email is a placeholder.`
    : [
        `Free CRO audit report ${lead.reportId}`,
        lead.failedChecks.length ? `Failed checks (${lead.failedChecks.length}): ${lead.failedChecks.slice(0, 8).join('; ')}` : '',
      ].filter(Boolean).join('\n');

  const storeUrl = lead.storeUrl;
  const fields: Record<string, string> = {
    NAME: cap(lead.stage === 'store' ? placeholderName(lead.storeUrl) : lead.name || 'Website Lead', 120),
    Email: cap(lead.stage === 'store' ? placeholderEmail(lead.storeUrl) : lead.email, 100),
    COBJ2CF10: cap(source.toString(), 450), // Source URL
    COBJ2CF2: cap(quals.join(' '), 255), // What's Ready
    COBJ2CF9: 'Existing Store Rework', // Service Category picklist
    COBJ2CF5: symptom, // Biggest Symptom
  };
  if (lead.stage === 'unlock' && lead.phone) fields.COBJ2CF8 = cap(lead.phone, 30); // Phone 1
  if (storeUrl) fields.COBJ2CF3 = cap(storeUrl, 450); // Existing Site
  return fields;
}

const SENT_STORES_KEY = 'mm_cro_stores_sent';

/**
 * Record the store as soon as the visitor submits it, so it reaches the CRM
 * even if they leave before the audit or never unlock the report. Sent once
 * per store per browser session.
 */
export function sendStoreLead(storeUrl: string): void {
  try {
    const host = hostOf(storeUrl);
    const sent: string[] = JSON.parse(stored(SENT_STORES_KEY) || '[]');
    if (sent.includes(host)) return;
    sendPaidLead({ stage: 'store', storeUrl });
    sessionStorage.setItem(SENT_STORES_KEY, JSON.stringify([...sent, host]));
  } catch {
    sendPaidLead({ stage: 'store', storeUrl });
  }
}

/** Record the visitor's details once they unlock their report. */
export function sendUnlockLead(lead: UnlockLead): void {
  sendPaidLead({ stage: 'unlock', ...lead });
}

function allowedHosts(): string[] {
  return (process.env.NEXT_PUBLIC_ZOHO_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim()).filter(Boolean);
}

/** Post the lead into a hidden iframe, so the page stays put. Never throws. */
function sendPaidLead(lead: Stage): void {
  try {
    const fields = toPaidFields(lead);
    if (!allowedHosts().includes(window.location.hostname) || !ZOHO_PAID_FORM.xnQsjsdp || !ZOHO_PAID_FORM.xmIwtLD) {
      console.info('[cro-lead] Not a production host; would submit to the Zoho paid-leads WebForm:', fields);
      return;
    }
    const form = document.createElement('form');
    form.action = ZOHO_PAID_FORM.action;
    form.method = 'POST';
    form.acceptCharset = 'UTF-8';
    form.style.display = 'none';
    const frame = document.createElement('iframe');
    frame.name = 'mm-zoho-frame-' + Math.random().toString(36).slice(2, 10);
    frame.title = 'Zoho lead submission target';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.display = 'none';
    form.target = frame.name;
    const add = (name: string, value: string) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };
    add('xnQsjsdp', ZOHO_PAID_FORM.xnQsjsdp);
    add('xmIwtLD', ZOHO_PAID_FORM.xmIwtLD);
    add('actionType', ZOHO_PAID_FORM.actionType);
    add('returnURL', ZOHO_PAID_FORM.returnURL);
    add('zc_gad', stored(GCLID_STORAGE_KEY)); // Google Ads click id
    add('aG9uZXlwb3Q', ''); // Zoho's honeypot, always empty
    for (const [name, value] of Object.entries(fields)) if (value) add(name, value);
    document.body.appendChild(frame);
    document.body.appendChild(form);
    // The iframe is cross-origin, so its load is the only sign Zoho answered.
    const timer = window.setTimeout(() => console.error('[cro-lead] Zoho did not acknowledge the lead within 8s. Check the webform id and key.'), 8000);
    frame.addEventListener('load', () => window.clearTimeout(timer), { once: true });
    form.submit();
  } catch (error) {
    console.error('[cro-lead] Could not send the lead to Zoho:', error);
  }
}
