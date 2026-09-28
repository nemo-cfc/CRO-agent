'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { displayHost, displayLink, parseStoreLink, sameStore } from '@/lib/store-link';

type Job = { id: string; status: 'running' | 'done' | 'error'; reportUrl?: string | null; error?: string };
type Match = { title: string; url: string; image: string | null; price: string | null; available: boolean | null };
type Step = 'store' | 'product';
type Search = { state: 'idle' | 'loading' | 'done' | 'error'; query: string; products: Match[]; message?: string };

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

/**
 * Step 1: the store address. Step 2: the best-selling product, found by name
 * on the store's own search and picked from photos. A pasted product link
 * skips step 2; "pick one for me" skips it too.
 */
export function AuditStartForm() {
  const [step, setStep] = useState<Step>('store');
  const [storeInput, setStoreInput] = useState('');
  const [store, setStore] = useState<URL | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<Search>({ state: 'idle', query: '', products: [] });
  const [active, setActive] = useState(-1);
  const [picked, setPicked] = useState<Match | null>(null);
  const [error, setError] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const storeRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  // Poll the running audit.
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const timer = window.setInterval(async () => {
      const res = await fetch(`/api/reports/${job.id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const next = (await res.json()) as Job;
      setJob(next);
      if (next.status === 'done' || next.status === 'error') window.clearInterval(timer);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (step === 'product') queryRef.current?.focus();
  }, [step]);

  // Live product search as the visitor types.
  useEffect(() => {
    if (step !== 'product' || !store) return;
    const q = query.trim();
    const asLink = parseStoreLink(q);
    if (q.length < MIN_QUERY || (!('error' in asLink) && asLink.kind === 'product')) {
      setSearch({ state: 'idle', query: q, products: [] });
      return;
    }
    const id = ++requestId.current;
    setSearch((s) => ({ ...s, state: 'loading', query: q }));
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/product-search?store=${encodeURIComponent(store.toString())}&q=${encodeURIComponent(q)}`, { cache: 'no-store' });
        const body = (await res.json()) as { products?: Match[]; error?: string };
        if (id !== requestId.current) return;
        if (!res.ok) throw new Error(body.error || 'Search failed');
        setSearch({ state: 'done', query: q, products: body.products ?? [] });
        setActive(-1);
      } catch (e) {
        if (id !== requestId.current) return;
        setSearch({ state: 'error', query: q, products: [], message: e instanceof Error ? e.message : 'Search failed' });
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, step, store]);

  async function start(storeUrl: URL, productUrl: URL | null) {
    setError('');
    setJob(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: storeUrl.toString(), productUrl: productUrl?.toString() ?? null }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error || 'We could not start the audit.');
      setJob({ id: body.id, status: 'running' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not start the audit. Please try again.');
    }
  }

  function submitStore(event: FormEvent) {
    event.preventDefault();
    if (job?.status === 'running') return;
    const parsed = parseStoreLink(storeInput);
    if ('error' in parsed) {
      setError(parsed.error);
      storeRef.current?.focus();
      return;
    }
    setError('');
    setStore(parsed.store);
    setStoreInput(displayHost(parsed.store));
    // A pasted product link already names the product: start straight away.
    if (parsed.kind === 'product') {
      setPicked({ title: displayLink(parsed.url), url: parsed.url.toString(), image: null, price: null, available: null });
      void start(parsed.store, parsed.url);
      return;
    }
    setStep('product');
  }

  function choose(match: Match) {
    if (!store || job?.status === 'running') return;
    setPicked(match);
    setError('');
    void start(store, new URL(match.url));
  }

  function submitProduct(event: FormEvent) {
    event.preventDefault();
    if (!store || job?.status === 'running') return;
    const q = query.trim();
    const asLink = parseStoreLink(q);
    if (!('error' in asLink) && asLink.kind === 'product') {
      if (!sameStore(asLink.url, store)) {
        setError(`That link is from ${displayHost(asLink.url)}. Choose a product from ${displayHost(store)}.`);
        return;
      }
      choose({ title: displayLink(asLink.url), url: asLink.url.toString(), image: null, price: null, available: null });
      return;
    }
    const pick = search.products[active >= 0 ? active : 0];
    if (pick && search.state === 'done' && search.query === q) {
      choose(pick);
      return;
    }
    setError(q.length < MIN_QUERY ? 'Type a few letters of the product’s name.' : 'Pick your product from the list, or let us choose one.');
  }

  function onQueryKey(event: React.KeyboardEvent<HTMLInputElement>) {
    const n = search.products.length;
    if (!n) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => (i + 1) % n); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => (i <= 0 ? n - 1 : i - 1)); }
  }

  function skip() {
    if (store && job?.status !== 'running') {
      setPicked(null);
      void start(store, null);
    }
  }

  function editStore() {
    setStep('store');
    setError('');
    setJob(null);
    setPicked(null);
    window.setTimeout(() => storeRef.current?.focus(), 0);
  }

  const running = job?.status === 'running';
  const showList = step === 'product' && query.trim().length >= MIN_QUERY && !running;

  if (job?.status === 'done' && job.reportUrl) {
    return (
      <div className="as-card as-ready" aria-live="polite">
        <div className="as-tick" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <span className="as-eyebrow">Your audit is ready</span>
        <h2>The useful bit <em>is waiting.</em></h2>
        <p className="as-meta">Open the evidence, priorities and next moves in full.</p>
        <a className="as-btn as-btn-block" href={job.reportUrl} target="_blank" rel="noreferrer">Open my audit report <span className="as-arr" aria-hidden="true">→</span></a>
        <p className="as-privacy">Opens in a new tab · available for 7 days</p>
      </div>
    );
  }

  return (
    <div className="as-card" id="audit-form">
      <div className="as-card-top">
        <h2>Get your free audit</h2>
        <span className="as-secure"><i aria-hidden="true" /> Private</span>
      </div>
      <div className="as-progress" aria-hidden="true">
        <span className="on" />
        <span className={step === 'product' ? 'on' : ''} />
      </div>

      {step === 'store' ? (
        <form onSubmit={submitStore} noValidate>
          <label htmlFor="as-store">Your store’s web address</label>
          <input
            ref={storeRef}
            id="as-store"
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="yourbrand.com"
            value={storeInput}
            onChange={(e) => setStoreInput(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby="as-store-hint as-error"
            disabled={running}
          />
          <p className="as-hint" id="as-store-hint">
            <span>No https:// or www needed</span><span>Public pages only</span><span>No login</span>
          </p>
          <button className="as-btn as-btn-block" type="submit" disabled={running}>
            {running ? 'Audit running live…' : <>Continue <span className="as-arr" aria-hidden="true">→</span></>}
          </button>
        </form>
      ) : (
        <form onSubmit={submitProduct} noValidate>
          <div className="as-echo">
            <span>Store</span>
            <b>{store ? displayHost(store) : storeInput}</b>
            <button type="button" onClick={editStore} disabled={running}>Edit</button>
          </div>
          <label htmlFor="as-query">Your best-selling product <span className="as-rec">Recommended</span></label>
          <p className="as-step-copy">Type its name and pick it from the list. We audit the page where the buying decision happens.</p>
          <div className="as-combo">
            <input
              ref={queryRef}
              id="as-query"
              type="text"
              role="combobox"
              aria-expanded={showList}
              aria-controls="as-results"
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `as-opt-${active}` : undefined}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="e.g. linen shirt, vitamin C serum"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setError(''); }}
              onKeyDown={onQueryKey}
              aria-describedby="as-error"
              disabled={running}
            />
            {search.state === 'loading' && showList && <span className="as-spin" aria-hidden="true" />}
          </div>

          {showList && (
            <div className="as-results" id="as-results" role="listbox" aria-label="Matching products">
              {search.state === 'loading' && search.products.length === 0 && <p className="as-results-note">Searching {store ? displayHost(store) : 'your store'}…</p>}
              {search.state === 'error' && <p className="as-results-note">We couldn’t search this store. You can let us pick a product instead.</p>}
              {search.state === 'done' && search.products.length === 0 && <p className="as-results-note">No products matched “{search.query}”. Try another word, paste the product’s link here, or let us pick one.</p>}
              {search.products.map((p, i) => (
                <button
                  key={p.url}
                  id={`as-opt-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`as-result${i === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(p)}
                >
                  <span className="as-result-img">{p.image ? <img src={p.image} alt="" loading="lazy" /> : <i aria-hidden="true" />}</span>
                  <span className="as-result-text">
                    <b>{p.title}</b>
                    <small>{[p.price, p.available === false ? 'Sold out' : null].filter(Boolean).join(' · ') || new URL(p.url).pathname}</small>
                  </span>
                  <span className="as-result-go" aria-hidden="true">Audit →</span>
                </button>
              ))}
            </div>
          )}

          <p className="as-skip">
            <button type="button" className="as-linkish" onClick={skip} disabled={running}>Skip, pick a product for me</button>
          </p>
        </form>
      )}

      <p className="as-error" id="as-error" role="alert">{error || (job?.status === 'error' ? job.error || 'The audit could not finish. Please try again.' : '')}</p>

      {running && (
        <div className="lp-monkey-loader" role="status" aria-live="polite">
          <div className="lp-swing-scene"><div className="lp-tree"><span className="lp-canopy lp-canopy-a" /><span className="lp-canopy lp-canopy-b" /><span className="lp-trunk" /></div><div className="lp-vine" /><svg className="lp-swinging-monkey" viewBox="0 0 90 100" aria-hidden="true"><g><circle cx="45" cy="25" r="13" /><circle cx="40" cy="23" r="2" /><circle cx="50" cy="23" r="2" /><path d="M38 31 Q45 37 52 31" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M34 43 Q45 37 56 43 L60 69 Q45 78 30 69 Z" /><path d="M34 47 Q16 52 20 70" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /><path d="M56 47 Q74 52 70 70" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /><path d="M36 68 Q28 84 22 91 M54 68 Q62 84 68 91" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /></g></svg><span className="lp-vine-grip" /></div>
          <div><strong>Live CRO audit in progress</strong><p>Reading {picked ? picked.title : store ? displayHost(store) : 'your store'} the way a shopper would. Keep this tab open.</p></div>
        </div>
      )}

      <p className="as-privacy"><span className="lp-lock" /> Contact details come after the audit, never before.</p>
    </div>
  );
}
