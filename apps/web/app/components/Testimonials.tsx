'use client';

import { useState } from 'react';

/** Founder video testimonials, as published on monkeyman.agency/la/shopify-store-optimisation. */
const SITE = 'https://monkeyman.agency';
const SPOTS = [
  {
    poster: '/images/la/video-cindy.webp', avatar: '/images/la/avatar-cindy.webp', length: '2:10', video: 'vNswXLtFO9o',
    metric: '+32%', note: 'Conversion rate after the GoDaddy move',
    quote: 'We were stuck on GoDaddy and terrified of losing the store. They moved every product, customer and order to Shopify over a weekend, redirects and all. Nothing broke, and the site finally converts.',
    who: 'Cindy Lieber', role: 'Founder, CindyKaye Jewelry',
  },
  {
    poster: '/images/la/video-brianna.webp', avatar: '/images/la/avatar-brianna.webp', length: '1:48', video: 'oe5d047RILw',
    metric: '+26%', note: 'Conversion rate after the redesign and CRO sprints',
    quote: 'They redesigned the whole store and then kept testing it. New product pages, a cleaner cart, a checkout that stopped losing people. It finally looks like the brand and it sells like it too.',
    who: 'Brianna Schmelzer', role: 'Founder, Luminaje Cosmetics',
  },
  {
    poster: '/images/la/video-randy.webp', avatar: '/images/la/avatar-randy.webp', length: '2:32', video: 'XmHO94J6xvY',
    metric: '2 weeks', note: 'Concept to a live store, built from scratch',
    quote: 'I had the products and the idea and nothing else. They built the whole store around it and handed it to me live in two weeks. I was selling before I expected to even have a site.',
    who: 'Randy Gowon', role: 'Founder, ÄMU Gallery',
  },
];

export function Testimonials() {
  // The poster stands in for the player until a visitor asks for the video.
  const [playing, setPlaying] = useState<number | null>(null);
  return (
    <div className="lp-spots">
      {SPOTS.map((s, i) => (
        <article className="lp-spot" key={s.who}>
          <div className="lp-spot-video">
            {playing === i ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${s.video}?autoplay=1&rel=0`}
                title={`${s.who}, ${s.role}`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <button type="button" onClick={() => setPlaying(i)} aria-label={`Play video: ${s.who}, ${s.role}`}>
                <img src={SITE + s.poster} alt="" width={760} height={428} loading="lazy" decoding="async" />
                <span className="lp-spot-ring" aria-hidden="true" />
                <span className="lp-spot-play" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                </span>
                <span className="lp-spot-len">{s.length}</span>
              </button>
            )}
          </div>
          <div className="lp-spot-metric">{s.metric}<small>{s.note}</small></div>
          <p className="lp-spot-quote">“{s.quote}”</p>
          <div className="lp-spot-by">
            <img src={SITE + s.avatar} alt="" width={38} height={38} loading="lazy" decoding="async" />
            <div><b>{s.who}</b><span>{s.role}</span></div>
          </div>
        </article>
      ))}
    </div>
  );
}
