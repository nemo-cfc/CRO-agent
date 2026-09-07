'use client';

import { FormEvent, useEffect, useState } from 'react';
import './landing.css';

type Job = { id: string; status: 'running' | 'done' | 'error'; reportUrl?: string | null; error?: string };

function Icon({ name }: { name: 'arrow' | 'spark' | 'flow' | 'shield' | 'chart' | 'play' }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <path d="M5 12h13m-5-5 5 5-5 5" />,
    spark: <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm6 12 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z" />,
    flow: <><rect x="3" y="4" width="6" height="5" rx="1" /><rect x="15" y="15" width="6" height="5" rx="1" /><path d="M9 6.5h3a3 3 0 0 1 3 3V15m0 0-2-2m2 2 2-2" /></>,
    shield: <path d="M12 3 20 6v5c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10V6l8-3Zm-3 9 2 2 4-4" />,
    chart: <><path d="M4 19V5m0 14h16" /><path d="m7 15 3-4 3 2 5-7" /></>,
    play: <><circle cx="12" cy="12" r="9" /><path d="m10 8 5 4-5 4V8Z" /></>,
  };
  return <svg className="lp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

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
      if (next.status === 'done' || next.status === 'error') window.clearInterval(timer);
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
      <nav className="lp-nav"><div className="lp-wrap"><a className="lp-brand" href="https://monkeyman.agency/"><img src="/monkeyman-mark.svg" alt="Monkeyman" /><span className="lp-logo">monkey<span>man</span></span></a><span className="lp-nav-trust">Revenue systems for the moments that matter</span></div></nav>
      <div className="lp-wrap">
        <section className="lp-hero" id="audit">
          <div className="lp-hero-copy">
            <div className="lp-eyebrow"><span className="lp-eyebrow-dot" /> FREE · INSTANT LIVE REVENUE AUDIT</div>
            <h1>Your ads are not the funnel.<br /><em>The money is won after the click.</em></h1>
            <p className="lp-lede">See where leads disappear between acquisition, landing page, qualification, follow-up, and sales. Get a <strong>FREE</strong> evidence-led website audit that starts <strong>INSTANTLY</strong> and runs <strong>LIVE</strong>.</p>
            <div className="lp-offer-badges"><div className="lp-free-badge"><span className="lp-free-star"><Icon name="spark" /></span><div><strong>100% FREE</strong><span>No card. No sales sequence.</span></div></div><div className="lp-live-badge"><span className="lp-live-dot"><i /></span><div><strong>INSTANT LIVE</strong><span>Watch the evidence arrive.</span></div></div></div>
            <div className="lp-hero-points"><span><Icon name="shield" /> No call required</span><span><Icon name="chart" /> Specific, measured findings</span><span><Icon name="flow" /> Built for action</span></div>
          </div>
          <aside className="lp-formcard lp-formcard-hero">
            {done && job?.reportUrl ? <div className="lp-report-ready"><div className="lp-report-mark" aria-hidden="true">OK</div><div className="lp-eyebrow">Your diagnostic is ready</div><h2>The useful bit<br />is waiting.</h2><p className="lp-formmeta">We found the signals. Open the evidence, priorities, and next moves in full.</p><a className="lp-button lp-button-large" href={job.reportUrl} target="_blank" rel="noreferrer">Get my audit report <Icon name="arrow" /></a><p className="lp-footnote"><span className="lp-lock" /> Opens in a new tab · available for 7 days</p></div> : <><div className="lp-formcard-top"><div className="lp-eyebrow">Start with the URL</div><span className="lp-secure"><i /> Private</span></div><h2>Get your<br />FREE audit.</h2><p className="lp-formmeta">We inspect the pages and moments closest to revenue. You get the audit before we ask for anything else.</p><form onSubmit={submit}><label htmlFor="store-url">Website or store URL</label><input id="store-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourstore.com" autoComplete="url" required /><p className="lp-hint">Public URL only. No login or code access needed.</p><button className="lp-button lp-button-large" type="submit" disabled={running}>{running ? 'Audit running live...' : <>Get my FREE audit <Icon name="arrow" /></>}</button></form>{error && <p className="lp-error" role="alert">{error}</p>}{running && <div className="lp-monkey-loader" role="status" aria-live="polite"><div className="lp-swing-scene"><div className="lp-tree"><span className="lp-canopy lp-canopy-a" /><span className="lp-canopy lp-canopy-b" /><span className="lp-trunk" /></div><div className="lp-vine" /><svg className="lp-swinging-monkey" viewBox="0 0 90 100" aria-hidden="true"><g><circle cx="45" cy="25" r="13" /><circle cx="40" cy="23" r="2" /><circle cx="50" cy="23" r="2" /><path d="M38 31 Q45 37 52 31" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M34 43 Q45 37 56 43 L60 69 Q45 78 30 69 Z" /><path d="M34 47 Q16 52 20 70" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /><path d="M56 47 Q74 52 70 70" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /><path d="M36 68 Q28 84 22 91 M54 68 Q62 84 68 91" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" /></g></svg><span className="lp-vine-grip" /></div><div><strong>Live diagnostic in progress</strong><p>Reading the moments where a visitor decides to continue, hesitate, or leave. Keep this tab open.</p></div></div>}<p className="lp-footnote"><span className="lp-lock" /> GDPR respectful. Contact details come after the diagnostic.</p></>}</aside>
        </section>

        <section className="lp-section lp-intent-section"><div className="lp-kicker">Start with the problem you recognise</div><h2 className="lp-sectiontitle">One audit. Five ways<br /><em>to find the leak.</em></h2><p className="lp-sectionlead">The FREE audit is the first step. If you already know where the pain sits, choose the route that sounds like your week.</p><div className="lp-grid three lp-intent-grid"><a className="lp-intent-card" href="#audit"><span className="lp-tile-icon"><Icon name="chart" /></span><strong>Paid leads are expensive</strong><p>See which traffic and landing-page signals are wasting spend.</p><span className="lp-intent-link">Audit my lead quality <Icon name="arrow" /></span></a><a className="lp-intent-card" href="#audit"><span className="lp-tile-icon"><Icon name="flow" /></span><strong>Leads are not followed up</strong><p>Map the response, qualification, ownership, and handoff gaps.</p><span className="lp-intent-link">Map my follow-up <Icon name="arrow" /></span></a><a className="lp-intent-card" href="#audit"><span className="lp-tile-icon"><Icon name="spark" /></span><strong>Sales cannot see revenue</strong><p>Find the missing fields between campaign, CRM, opportunity, and sale.</p><span className="lp-intent-link">Find my revenue leaks <Icon name="arrow" /></span></a></div></section>
        <section className="lp-section lp-section-tight"><div className="lp-kicker">The real problem</div><h2 className="lp-sectiontitle">Your funnel is a chain.<br /><em>One weak link taxes every other one.</em></h2><p className="lp-sectionlead">We connect the parts most businesses inspect separately: acquisition, page experience, qualification, response, sales ownership, and revenue reporting.</p><div className="lp-system-line"><span>Paid traffic</span><b>→</b><span>Landing page</span><b>→</b><span>Qualification</span><b>→</b><span>Follow-up</span><b>→</b><span>Revenue</span></div></section>

        <section className="lp-section"><div className="lp-kicker">What the FREE audit gives you</div><h2 className="lp-sectiontitle">A clear first move, not another<br /><em>deck full of advice.</em></h2><div className="lp-grid three"><article className="lp-tile"><span className="lp-tile-icon"><Icon name="chart" /></span><div className="lp-num">01 · Find</div><h3>Where intent disappears</h3><p>Measured friction across your entry page, mobile experience, calls to action, trust, and the route to contact.</p></article><article className="lp-tile"><span className="lp-tile-icon"><Icon name="flow" /></span><div className="lp-num">02 · Prioritise</div><h3>What to fix first</h3><p>A short ranked list tied to the visitor action and the evidence behind the recommendation.</p></article><article className="lp-tile"><span className="lp-tile-icon"><Icon name="spark" /></span><div className="lp-num">03 · Move</div><h3>What happens next</h3><p>Concrete copy, layout, workflow, and measurement changes your team can put into motion.</p></article></div></section>

        <section className="lp-section lp-section-dark"><div className="lp-kicker">The operating system</div><h2 className="lp-sectiontitle">Make invisible expertise<br /><em>easy to believe.</em></h2><p className="lp-sectionlead">When the job is complex, the buyer needs to see the system: inputs, decisions, handoffs, safeguards, and the number that proves it worked.</p><div className="lp-ops-grid"><div><span className="lp-ops-label">INPUTS</span><strong>Campaign, page, CRM, conversation</strong></div><div><span className="lp-ops-label">DECISIONS</span><strong>Intent, fit, urgency, ownership</strong></div><div><span className="lp-ops-label">ACTIONS</span><strong>Respond, route, follow up, book</strong></div><div><span className="lp-ops-label">PROOF</span><strong>Qualified pipeline and closed revenue</strong></div></div></section>

        <section className="lp-section"><div className="lp-kicker">Proof from the work</div><h2 className="lp-sectiontitle">Let the people who used it<br /><em>tell the story.</em></h2><p className="lp-sectionlead">Drop real customer recordings into these slots. Each video should show the starting problem, the system shipped, and what changed afterward.</p><div className="lp-grid three lp-video-grid"><article className="lp-video-card"><div className="lp-video-placeholder"><Icon name="play" /><span>Testimonial video · 01</span></div><div className="lp-video-meta"><strong>“We stopped losing good leads in the handoff.”</strong><span>Founder · B2B services · 90 sec</span></div></article><article className="lp-video-card"><div className="lp-video-placeholder"><Icon name="play" /><span>Testimonial video · 02</span></div><div className="lp-video-meta"><strong>“The team could finally see what paid traffic created.”</strong><span>Head of Growth · E-commerce · 75 sec</span></div></article><article className="lp-video-card"><div className="lp-video-placeholder"><Icon name="play" /><span>Testimonial video · 03</span></div><div className="lp-video-meta"><strong>“It felt like a partner, not another tool to manage.”</strong><span>Managing Director · SaaS · 60 sec</span></div></article></div></section>

        <section className="lp-section lp-showcase"><div className="lp-kicker">Work showcase</div><h2 className="lp-sectiontitle">Show the system in its<br /><em>native habitat.</em></h2><p className="lp-sectionlead">Replace these cards with annotated screenshots, before-and-after flows, and short walkthroughs. The artifact is the proof.</p><div className="lp-grid two"><article className="lp-work-card"><div className="lp-work-visual lp-work-orange"><span>01</span><strong>Lead-to-revenue map</strong><small>Acquisition → qualification → CRM → sale</small></div><div className="lp-work-copy"><div className="lp-num">Revenue operations</div><h3>One view of what the funnel is doing.</h3><p>Show the fields, stages, owners, and reporting layer that stopped “leads” being the only number in the room.</p><a href="#audit">See what is leaking <Icon name="arrow" /></a></div></article><article className="lp-work-card"><div className="lp-work-visual lp-work-green"><span>02</span><strong>AI qualification flow</strong><small>Message → intent → human handoff</small></div><div className="lp-work-copy"><div className="lp-num">Conversion systems</div><h3>A faster answer without a colder experience.</h3><p>Show the actual conversation, guardrails, CRM record, and moment a human takes over.</p><a href="#audit">Find my first move <Icon name="arrow" /></a></div></article></div></section>

        <section className="lp-section"><div className="lp-kicker">How we work</div><h2 className="lp-sectiontitle">Control first.<br /><em>Then accelerate.</em></h2><div className="lp-process"><div><span>01</span><strong>Diagnose</strong><p>Read the real journey and identify the expensive uncertainty.</p></div><div><span>02</span><strong>Design</strong><p>Turn the highest-impact change into a clear experience and workflow.</p></div><div><span>03</span><strong>Ship</strong><p>Build the page, automation, CRM logic, and handoff with ownership visible.</p></div><div><span>04</span><strong>Prove</strong><p>Measure response, qualification, booking, pipeline, and revenue.</p></div></div></section>

        <section className="lp-section lp-faq"><div className="lp-kicker">Questions worth asking</div><h2 className="lp-sectiontitle">Before you hand over<br /><em>your growth system.</em></h2><details open><summary>Do I need a call to get the diagnostic?</summary><p>No. Enter the URL, watch it run live, and open the report. We ask for contact details only after the work has been delivered.</p></details><details><summary>Will you ask for access to my ad account or CRM?</summary><p>Not for the first diagnostic. It is built from the public journey. Deeper implementation work starts only after the problem and scope are clear.</p></details><details><summary>Is this an AI-generated report?</summary><p>The measurements come from a deterministic audit engine. Groq helps turn those measured findings into prioritised recommendations; the report shows the evidence behind each one.</p></details></section>

        <section className="lp-repeat"><div><div className="lp-kicker">Start with certainty</div><h2>Find the leak before<br /><em>you fund the fix.</em></h2><p>Free. Instant live. Specific enough to share with your team.</p></div><a className="lp-button" href="#audit">Get my FREE audit <Icon name="arrow" /></a></section>
        <footer className="lp-footer"><span className="lp-logo">monkey<span>man</span></span><span>Revenue systems · evidence before enthusiasm</span></footer>
      </div>
    </main>
  );
}