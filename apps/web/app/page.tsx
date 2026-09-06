'use client';

import { useState } from 'react';
import { PLATFORM_LABELS, ROLE_LABELS, isStore } from '@cro/shared';
import { useAuditStream } from '@/lib/useAuditStream';
import { ProgressRail } from './components/ProgressRail';
import { Scorecard } from './components/Scorecard';
import { ChecksPanel } from './components/ChecksPanel';
import { Recommendations } from './components/Recommendations';

const EXAMPLES = ['allbirds.com', 'stripe.com', 'linear.app', 'notion.so'];

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === '/' ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}

export default function Home() {
  const [input, setInput] = useState('');
  const { state, start, reset } = useAuditStream();

  const running = state.status === 'running';
  const engaged = state.status !== 'idle';

  return (
    <div className="page">
      <div className="grain" aria-hidden />

      <header className="nav">
        <div className="brand">
          <span className="mark" aria-hidden>
            ◇
          </span>
          <span className="word">CRO Agent</span>
        </div>
        <div className="navMeta">
          <span className="pill">47 checks</span>
          <span className="pill">Groq · free</span>
          <span className="pill">≤ 30s</span>
        </div>
      </header>

      <main className={`wrap ${engaged ? 'engaged' : ''}`}>
        <section className="hero">
          <p className="kicker">Conversion intelligence</p>
          <h1>
            See why they bounce.
            <em> Fix what actually converts.</em>
          </h1>
          <p className="lede">
            Paste a URL. We load the pages that matter — homepage and the highest-intent page, or
            the full store funnel — run forty-seven conversion checks, and write the brief. Live,
            in under thirty seconds.
          </p>

          <form
            className="launcher"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim() && !running) void start(input.trim());
            }}
          >
            <span className="proto">https://</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="yoursite.com"
              aria-label="Website address"
              autoComplete="url"
              spellCheck={false}
            />
            <button type="submit" disabled={running || input.trim().length === 0}>
              {running ? 'Auditing' : 'Run audit'}
            </button>
          </form>

          {!engaged && (
            <div className="examples">
              <span>Try</span>
              {EXAMPLES.map((ex) => (
                <button
                  type="button"
                  key={ex}
                  className="chip"
                  onClick={() => {
                    setInput(ex);
                    void start(ex);
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          )}

          {engaged && (
            <div className="heroActions">
              <button type="button" className="ghost" onClick={reset} disabled={running}>
                New audit
              </button>
            </div>
          )}
        </section>

        {engaged && (
          <ProgressRail phase={state.phase} elapsed={state.elapsed} running={running} />
        )}

        {state.error && (
          <div className="notice error">
            <b>Could not finish.</b> {state.error}
          </div>
        )}

        {(state.url || state.title) && (
          <section className="panel">
            <div className="panelHead">
              <h2>
                Audited
                {state.platform && isStore(state.platform) && (
                  <span className="platformTag">{PLATFORM_LABELS[state.platform]}</span>
                )}
              </h2>
              {state.durationMs !== null && (
                <p>Closed in {(state.durationMs / 1000).toFixed(1)}s</p>
              )}
            </div>
            <div className="meta">
              {state.title && (
                <span>
                  <b>{state.title}</b>
                </span>
              )}
              {state.url && (
                <span>
                  <a href={state.url} target="_blank" rel="noreferrer noopener">
                    {state.url}
                  </a>
                </span>
              )}
              {state.generator && (
                <span>
                  built with <b>{state.generator}</b>
                </span>
              )}
            </div>

            {state.targets.length > 0 && (
              <ol className="targets">
                {state.targets.map((t) => (
                  <li key={t.url + t.role}>
                    <span className={`roleTag ${t.role}`}>{ROLE_LABELS[t.role]}</span>
                    <a href={t.url} target="_blank" rel="noreferrer noopener">
                      {pathOf(t.url)}
                    </a>
                    <span className="why">{t.reason}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {state.shots.length > 0 && (
          <section className="panel">
            <div className="panelHead">
              <h2>What we saw</h2>
              <p>Live captures at the widths that matter. Not fed to the model.</p>
            </div>
            <div className="shots">
              {state.shots.map((s) => (
                <figure className="shot" key={`${s.role}-${s.viewport}`}>
                  <figcaption>
                    {ROLE_LABELS[s.role]} · {s.viewport}
                  </figcaption>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.dataUri} alt={`${s.role} at ${s.viewport} width`} />
                </figure>
              ))}
            </div>
          </section>
        )}

        {state.scorecard && <Scorecard scorecard={state.scorecard} />}

        <Recommendations
          summary={state.summary}
          recommendations={state.recommendations}
          writing={running && state.phase === 'writing'}
        />

        {state.checks.length > 0 && <ChecksPanel checks={state.checks} />}

        {state.notes.length > 0 && (
          <div className="notice">
            {state.notes.map((n, i) => (
              <div key={i}>{n}</div>
            ))}
          </div>
        )}
      </main>

      <footer className="foot">
        <p>Rules measure. The model only writes. Groq on the free tier.</p>
      </footer>
    </div>
  );
}
