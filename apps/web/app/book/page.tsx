import '../report.css';

export const metadata = { title: 'Book your full CRO audit | Monkeyman', robots: { index: false, follow: false } };

/**
 * Booking page reached from the report's "Book a full audit" buttons and the
 * unlock pop-up. Embeds the scheduling calendar when one is configured.
 */
export default function BookPage() {
  const calendar = process.env.NEXT_PUBLIC_ZOHO_CALENDAR_URL;
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
        {calendar ? (
          <iframe className="rp-calendar" src={calendar} title="Book a full CRO audit" loading="eager" />
        ) : (
          <section className="rp-section rp-calendar-missing">
            <h2>Calendar coming soon</h2>
            <p className="rp-lede">Online booking is not set up yet. Email us and we will send you a few times that work.</p>
            <a className="rp-btn" href="mailto:hello@monkeyman.agency?subject=Book%20a%20full%20CRO%20audit">Email to book a full audit</a>
          </section>
        )}
      </main>
    </div>
  );
}
