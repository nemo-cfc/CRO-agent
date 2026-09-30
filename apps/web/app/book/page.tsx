import '../report.css';

export const metadata = { title: 'Book your full CRO audit | Monkeyman', robots: { index: false, follow: false } };

/** Calendly event for full-audit calls; NEXT_PUBLIC_CALENDLY_URL overrides it per deployment. */
const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL || 'https://calendly.com/aayushi-k-appwrk/30min';

/** Inline-embed form of the event link, themed to the page (colours apply on paid Calendly plans). */
function calendlyEmbed(url: string) {
  const embed = new URL(url);
  embed.searchParams.set('embed_type', 'Inline');
  embed.searchParams.set('hide_gdpr_banner', '1');
  embed.searchParams.set('background_color', '1d1815');
  embed.searchParams.set('text_color', 'f4efe6');
  embed.searchParams.set('primary_color', 'd67a3a');
  return embed.toString();
}

/**
 * Booking page reached from the report's "Book a full audit" buttons and the
 * unlock pop-up. Embeds the Calendly scheduler inline.
 */
export default function BookPage() {
  return (
    <div className="rp">
      <header className="rp-bar">
        <a className="rp-logo" href="/">monkey<span>man</span></a>
        <span className="rp-bar-title">Book your full audit</span>
      </header>
      <main className="rp-sheet rp-book">
        <section className="rp-hero rp-book-hero">
          <div className="rp-hero-text">
            <p className="rp-eyebrow">Full CRO audit</p>
            <h1>Pick a time that suits you</h1>
            <p className="rp-meta">A specialist walks through your checkout, tracking, product pages and navigation, then hands you a prioritised roadmap. The call is free and there is no obligation.</p>
          </div>
        </section>
        <iframe className="rp-calendar" src={calendlyEmbed(CALENDLY_URL)} title="Book a full CRO audit" loading="eager" />
      </main>
    </div>
  );
}
