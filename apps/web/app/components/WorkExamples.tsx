'use client';

import { useEffect, useRef } from 'react';

/** Storefront recordings, as published on monkeyman.agency/work. */
const SITE = 'https://monkeyman.agency';
const WORK = [
  { name: 'Leah Alexandra', niche: 'Jewelry', slug: 'leah-alexandra', store: 'https://leahalexandra.com' },
  { name: 'Menyard', niche: 'Fashion', slug: 'menyard-homme', store: 'https://menyardhomme.com' },
  { name: 'Canopy Beauty', niche: 'Beauty', slug: 'canopy-beauty', store: 'https://canopybeauty.co.uk' },
];

function WorkCard({ item }: { item: (typeof WORK)[number] }) {
  const video = useRef<HTMLVideoElement>(null);
  const caseStudy = `${SITE}/work/${item.slug}/`;

  const play = () => {
    const v = video.current;
    if (!v) return;
    // The recording only downloads once someone asks to see it.
    if (!v.getAttribute('src')) v.src = `${SITE}/videos/work/${item.slug}.mp4`;
    v.play().then(() => v.parentElement?.classList.add('is-playing')).catch(() => {});
  };
  const stop = () => {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.parentElement?.classList.remove('is-playing');
  };

  // Touch screens have no hover: play whichever card is mostly on screen.
  useEffect(() => {
    const v = video.current;
    if (!v || window.matchMedia('(hover: hover)').matches) return;
    const io = new IntersectionObserver(([entry]) => (entry.isIntersecting ? play() : stop()), { threshold: 0.6 });
    io.observe(v);
    return () => io.disconnect();
  }, []);

  return (
    <li className="lp-work-ex" onMouseEnter={play} onMouseLeave={stop}>
      <a className="lp-work-ex-media" href={caseStudy} target="_blank" rel="noopener" tabIndex={-1} aria-hidden="true" onFocus={play} onBlur={stop}>
        <img src={`${SITE}/images/work/posters/${item.slug}.webp`} alt="" width={960} height={460} loading="lazy" decoding="async" />
        <video ref={video} muted loop playsInline preload="none" />
        <span className="lp-work-ex-pill">{item.niche}</span>
      </a>
      <div className="lp-work-ex-meta">
        <h3><a href={caseStudy} target="_blank" rel="noopener" onFocus={play} onBlur={stop}>{item.name}</a></h3>
        <div className="lp-work-ex-links">
          <a className="is-accent" href={caseStudy} target="_blank" rel="noopener">Case study →</a>
          <a href={item.store} target="_blank" rel="noopener">Visit store ↗<span className="sr-only"> ({item.name}, opens in a new tab)</span></a>
        </div>
      </div>
    </li>
  );
}

export function WorkExamples() {
  return <ul className="lp-work-ex-grid">{WORK.map((item) => <WorkCard key={item.slug} item={item} />)}</ul>;
}
