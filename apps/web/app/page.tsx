'use client';

import { AuditStartForm } from './components/AuditStartForm';
import { Testimonials } from './components/Testimonials';
import { WorkExamples } from './components/WorkExamples';
import { FrictionMapVisual, TeardownVisual } from './components/WorkVisuals';
import './landing.css';
import './audit-start.css';

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
  return (
    <main className="landing landing-compact lp-v2">
      <nav className="lp-nav"><div className="lp-wrap"><a className="lp-brand" href="https://monkeyman.agency/"><img src="/monkeyman-mark.svg" alt="Monkeyman" /><span className="lp-logo">monkey<span>man</span></span></a><span className="lp-nav-trust">Conversion systems for stores with real visitors</span></div></nav>
      <div className="lp-wrap">
        <section className="lp-hero" id="audit">
          <div className="as-orb a" aria-hidden="true" /><div className="as-orb b" aria-hidden="true" /><div className="as-grid-bg" aria-hidden="true" />
          <div className="lp-hero-copy">
            <span className="as-eyebrow">Free · instant · live CRO audit</span>
            <h1><span className="line"><span>Your store gets visitors.</span></span><span className="line"><span><em>Why don’t more of them buy?</em></span></span></h1>
            <p className="lp-lede">Tell us your store and your <strong>best-selling product</strong>. We audit it the way a shopper would, along with the collection it sits in and your homepage, and show you <strong>where buyers hesitate</strong>, ranked by how much each fix could help.</p>
            <div className="as-chips" aria-label="What you get">
              <span className="as-chip"><Icon name="spark" /><strong>100% free</strong> no card</span>
              <span className="as-chip"><Icon name="play" /><strong>Live</strong> watch it run</span>
              <span className="as-chip"><Icon name="shield" /><strong>No login</strong> public pages only</span>
            </div>
            <ol className="as-steps">
              <li><span className="n">1</span><span><b>Enter your store and pick your best-seller</b> by name. No links to copy.</span></li>
              <li><span className="n">2</span><span><b>We follow the shopper’s path</b> from homepage to collection to product and cart.</span></li>
              <li><span className="n">3</span><span><b>Get a ranked list of fixes</b> with screenshots of what we found.</span></li>
            </ol>
          </div>
          <div className="as-form-col">
            <div className="as-toast t1" aria-hidden="true"><i>!</i>Friction found: product page</div>
            <div className="as-toast t2" aria-hidden="true"><i>✓</i>Fix #1 ranked · High opportunity</div>
            <AuditStartForm />
          </div>
        </section>

        <section className="lp-section lp-intent-section"><div className="lp-kicker">Start with the problem you recognise</div><h2 className="lp-sectiontitle">One audit. Five ways<br /><em>to find the leak.</em></h2><p className="lp-sectionlead">The FREE audit is the first step. If you already know where the pain sits, choose the part of the shopping journey you want to inspect first.</p><div className="lp-grid three lp-intent-grid"><a className="lp-intent-card" href="#audit"><span className="lp-tile-icon"><Icon name="chart" /></span><strong>Product pages lose shoppers</strong><p>Find the details making shoppers pause.</p><span className="lp-intent-link">Audit my product journey <Icon name="arrow" /></span></a><a className="lp-intent-card" href="#audit"><span className="lp-tile-icon"><Icon name="flow" /></span><strong>Checkout feels uncertain</strong><p>Find the doubt before payment.</p><span className="lp-intent-link">Audit my checkout <Icon name="arrow" /></span></a><a className="lp-intent-card" href="#audit"><span className="lp-tile-icon"><Icon name="spark" /></span><strong>Mobile visitors hesitate</strong><p>Find the mobile moments costing orders.</p><span className="lp-intent-link">Audit my mobile store <Icon name="arrow" /></span></a></div></section>
        <section className="lp-section lp-section-tight"><div className="lp-kicker">The real problem</div><h2 className="lp-sectiontitle">Your shopping journey is a chain.<br /><em>One weak link taxes every other one.</em></h2><p className="lp-sectionlead">Message. Product detail. Trust. Cart. Checkout. Mobile.</p><div className="lp-system-line"><span>Entry page</span><b>→</b><span>Product page</span><b>→</b><span>Cart</span><b>→</b><span>Checkout</span><b>→</b><span>Purchase</span></div></section>

        <section className="lp-section"><div className="lp-kicker">What the FREE audit gives you</div><h2 className="lp-sectiontitle">A clear first move, not another<br /><em>deck full of advice.</em></h2><div className="lp-grid three"><article className="lp-tile"><span className="lp-tile-icon"><Icon name="chart" /></span><div className="lp-num">01 · Find</div><h3>Where intent disappears</h3><p>Measured friction across the journey to purchase.</p></article><article className="lp-tile"><span className="lp-tile-icon"><Icon name="flow" /></span><div className="lp-num">02 · Prioritise</div><h3>What to fix first</h3><p>A ranked list with evidence.</p></article><article className="lp-tile"><span className="lp-tile-icon"><Icon name="spark" /></span><div className="lp-num">03 · Move</div><h3>What happens next</h3><p>The next changes worth making.</p></article></div></section>

        <section className="lp-section lp-section-dark"><div className="lp-kicker">The audit, made visible</div><h2 className="lp-sectiontitle">Make invisible expertise<br /><em>easy to believe.</em></h2><p className="lp-sectionlead">See what we measured, what we would change, and how to prove it worked.</p><div className="lp-ops-grid"><div><span className="lp-ops-label">INPUTS</span><strong>Page evidence, shopper behaviour, checkout signals</strong></div><div><span className="lp-ops-label">DECISIONS</span><strong>Clarity, trust, confidence, momentum</strong></div><div><span className="lp-ops-label">ACTIONS</span><strong>Read, prioritise, rebuild, measure</strong></div><div><span className="lp-ops-label">PROOF</span><strong>Completed orders and higher order value</strong></div></div></section>

        <section className="lp-section lp-founders"><div className="lp-kicker">What changed, in their words</div><h2 className="lp-sectiontitle">Three founders. Three numbers<br /><em>that moved.</em></h2><Testimonials /></section>

        <section className="lp-section lp-work-examples"><div className="lp-kicker">Showcase</div><h2 className="lp-sectiontitle">Proof, in <em>motion.</em></h2><p className="lp-sectionlead">Storefronts we built, redesigned, and scaled, captured live. Hover any store to watch it move.</p><WorkExamples /></section>

        <section className="lp-section lp-showcase"><div className="lp-kicker">Work showcase</div><h2 className="lp-sectiontitle">Show the system in its<br /><em>native habitat.</em></h2><p className="lp-sectionlead">Annotated screens and before-and-after journeys. The work is the proof.</p><div className="lp-grid two"><article className="lp-work-card"><div className="lp-work-visual lp-work-orange"><TeardownVisual /><span>01</span><strong>Product-page teardown</strong><small>Message → detail → trust → purchase</small></div><div className="lp-work-copy"><div className="lp-num">Conversion optimisation</div><h3>See the exact moments a shopper decides to continue or leave.</h3><p>Evidence first. Better decisions next.</p><a href="#audit">See what is leaking <Icon name="arrow" /></a></div></article><article className="lp-work-card"><div className="lp-work-visual lp-work-green"><FrictionMapVisual /><span>02</span><strong>Checkout friction map</strong><small>Product → cart → payment</small></div><div className="lp-work-copy"><div className="lp-num">Conversion systems</div><h3>A clearer path to purchase without a louder page.</h3><p>The change, the reason, the proof.</p><a href="#audit">Find my first move <Icon name="arrow" /></a></div></article></div></section>

        <section className="lp-section"><div className="lp-kicker">How we work</div><h2 className="lp-sectiontitle">Control first.<br /><em>Then accelerate.</em></h2><div className="lp-process"><div><span>01</span><strong>Diagnose</strong><p>Read the journey.</p></div><div><span>02</span><strong>Design</strong><p>Choose the highest-impact change.</p></div><div><span>03</span><strong>Ship</strong><p>Rebuild the moment.</p></div><div><span>04</span><strong>Prove</strong><p>Measure completed orders and order value.</p></div></div></section>

        <section className="lp-section lp-faq"><div className="lp-kicker">Questions worth asking</div><h2 className="lp-sectiontitle">Before you change<br /><em>another thing.</em></h2><details open><summary>Do I need a call to get the diagnostic?</summary><p>No. Enter the URL, watch it run live, and open the report. We ask for contact details only after the work has been delivered.</p></details><details><summary>Do I need to give you analytics or Shopify access?</summary><p>Not for the FREE audit. We start with the public shopping journey. Deeper work begins only after the problem and scope are clear.</p></details><details><summary>Is this an AI-generated report?</summary><p>The measurements come from a deterministic audit engine. Groq helps turn those measured findings into prioritised recommendations; the report shows the evidence behind each one.</p></details></section>

        <section className="lp-repeat"><div><div className="lp-kicker">Start with certainty</div><h2>Find the leak before<br /><em>you fund the fix.</em></h2><p>Free. Instant live. Specific enough to share with your team.</p></div><a className="lp-button" href="#audit">Get my FREE audit <Icon name="arrow" /></a></section>
        <footer className="lp-footer"><span className="lp-logo">monkey<span>man</span></span><span>Shopify CRO · evidence before opinion</span></footer>
      </div>
    </main>
  );
}