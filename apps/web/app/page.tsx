'use client';

import { FormEvent, useEffect, useState } from 'react';
import './landing.css';

type Job = { id: string; status: 'running' | 'done' | 'error'; reportUrl?: string | null; error?: string };

export default function Home() {
  const [url, setUrl] = useState('');
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const timer = window.setInterval(async () => {
      const res = await fetch(`/api/reports/${job.id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const next = (await res.json()) as Job;
      setJob(next);
      if (next.status === 'done') window.clearInterval(timer);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!url.trim() || job?.status === 'running') return;
    setError('');
    setJob(null);
    try {
      const res = await fetch('/api/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url.trim() }) });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error || 'We could not start the audit.');
      setJob({ id: body.id, status: 'running' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check your store URL.');
    }
  }

  const done = job?.status === 'done';
  const running = job?.status === 'running';
  return (
    <main className="landing landing-compact">
      <nav className="lp-nav"><div className="lp-wrap"><a className="lp-brand" href="https://monkeyman.agency/"><img src="/monkeyman-mark.svg" alt="Monkeyman" /><span className="lp-logo">monkey<span>man</span></span></a><span className="lp-nav-trust">A useful second opinion for your store</span></div></nav>
      <div className="lp-wrap"><section className="lp-hero"><div className="lp-hero-copy"><div className="lp-eyebrow">FREE Shopify CRO audit / Instant live results</div><h1>Your store is not a website.<br /><em>It is a series of tiny decisions.</em></h1><p className="lp-lede">Most stores do not lose sales because one thing is catastrophically wrong. They lose them through a dozen small hesitations. Get a <strong>FREE</strong>, evidence-based read of yours. It starts <strong>INSTANTLY</strong> and runs <strong>LIVE</strong>.</p><div className="lp-offer-badges"><div className="lp-free-badge"><strong>100% FREE</strong><span>No card. No obligation.</span></div><div className="lp-live-badge"><span className="lp-live-dot"><i /></span><div><strong>INSTANT LIVE</strong><span>Watch the evidence arrive.</span></div></div></div><div className="lp-proof"><div><strong>250+ stores</strong><span>Monkeyman experience</span></div><div><strong>5 niches</strong><span>Built across industries</span></div><div><strong>48 hours</strong><span>Written quote if useful</span></div><div><strong>14 countries</strong><span>US / UK / EU / UAE / ANZ</span></div></div></div><aside className="lp-formcard lp-formcard-hero">{done && job?.reportUrl ? <div className="lp-report-ready"><div className="lp-report-mark" aria-hidden="true">OK</div><div className="lp-eyebrow">Your report is ready</div><h2>The useful bit<br />is waiting.</h2><p className="lp-formmeta">We found the signals. Now you can see the evidence, priorities, and next moves in full.</p><a className="lp-button lp-button-large" href={job.reportUrl} target="_blank" rel="noreferrer">Get my audit report</a><p className="lp-footnote"><span className="lp-lock" /> Your report opens in a new tab and stays available to you.</p></div> : <><div className="lp-formcard-top"><div className="lp-eyebrow">Let the machine look first</div><span className="lp-secure"><i /> Secure</span></div><h2>Give us the URL.<br />We will do the looking.</h2><p className="lp-formmeta">A live read of the pages where shoppers hesitate.</p><form onSubmit={submit}><label htmlFor="store-url">Your store URL</label><input id="store-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourstore.com" autoComplete="url" required /><p className="lp-hint">We inspect a few high-intent pages. Your whole site stays yours.</p><button className="lp-button lp-button-large" type="submit" disabled={running}>{running ? 'Audit running live...' : 'Get my FREE audit'}</button></form>{error && <p className="lp-error" role="alert">{error}</p>}{running && <div className="lp-monkey-loader" role="status" aria-live="polite"><div className="lp-swing-scene"><div className="lp-tree"><span className="lp-canopy lp-canopy-a" /><span className="lp-canopy lp-canopy-b" /><span className="lp-trunk" /></div><div className="lp-vine" /><svg className="lp-swinging-monkey" viewBox="0 0 90 100" aria-hidden="true"><g><circle cx="45" cy="25" r="13" /><circle cx="40" cy="23" r="2" /><circle cx="50" cy="23" r="2" /><path d="M38 31 Q45 37 52 31" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M34 43 Q45 37 56 43 L60 69 Q45 78 30 69 Z" /><path d="M34 47 Q16 52 20 70" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /><path d="M56 47 Q74 52 70 70" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /><path d="M36 68 Q28 84 22 91 M54 68 Q62 84 68 91" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /></g></svg><span className="lp-vine-grip" /></div><div><strong>Audit running live</strong><p>Our little monkey is checking the pages where shoppers hesitate. Keep this tab open; your report will be ready here.</p></div></div>}<p className="lp-footnote"><span className="lp-lock" /> GDPR respectful. We ask for contact details only after the report is ready.</p></>}</aside></section><footer className="lp-footer"><span className="lp-logo">monkey<span>man</span></span><span> / Shopify by choice</span></footer></div>
    </main>
  );
}
