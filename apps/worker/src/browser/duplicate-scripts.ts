export interface DuplicateScript { provider: 'Meta' | 'Google Ads / Analytics' | 'Google Tag Manager'; source: string; count: number }

/** Literal active loader references, not proof that events were counted twice. */
export function collectDuplicateScripts(): DuplicateScript[] {
  const groups = new Map<string, { provider: DuplicateScript['provider']; source: string; count: number }>();
  for (const script of Array.from(document.scripts)) {
    if (!script.src || (script.type && !['text/javascript','application/javascript','module'].includes(script.type))) continue;
    try {
      const url = new URL(script.src);
      let provider: DuplicateScript['provider'];
      if (url.hostname === 'connect.facebook.net' && /\/fbevents\.js$/.test(url.pathname)) provider = 'Meta';
      else if (url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtag/js' && /^(G|AW|GT)-[A-Z0-9]+$/i.test(url.searchParams.get('id') ?? '')) provider = 'Google Ads / Analytics';
      else if (url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtm.js' && /^GTM-[A-Z0-9]+$/i.test(url.searchParams.get('id') ?? '')) provider = 'Google Tag Manager';
      else continue;
      url.hash = ''; url.searchParams.sort();
      const key = url.toString();
      const entry = groups.get(key) ?? { provider, source: url.origin + url.pathname + (url.searchParams.has('id') ? '?id=' + encodeURIComponent(url.searchParams.get('id')!) : ''), count: 0 };
      entry.count++; groups.set(key, entry);
    } catch { /* Invalid or unknown URLs cannot support a finding. */ }
  }
  return [...groups.values()].filter(entry => entry.count > 1);
}
