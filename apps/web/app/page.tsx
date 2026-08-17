'use client';

import { useState } from 'react';
import { PLATFORM_LABELS, ROLE_LABELS, isStore } from '@cro/shared';
import { useAuditStream } from '@/lib/useAuditStream';
import { ProgressRail } from './components/ProgressRail';
import { Scorecard } from './components/Scorecard';
import { ChecksPanel } from './components/ChecksPanel';
import { Recommendations } from './components/Recommendations';

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
  const { state, start } = useAuditStream();

  const running = state.status === 'running';

  return (
    <main className="wrap">
      <header className="masthead">
        <h1>CRO Audit Agent</h1>
        <p>
          Enter a website. It loads the homepage and the highest-intent page it can find, on desktop
          and mobile, runs 47 conversion checks, and writes up what to change — in under 30 seconds.
        </p>
      </header>

      <form
        className="launcher"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !running) void start(input.trim());
        }}
      >
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
          {running ? 'Auditing…' : 'Run audit'}
        </button>
      </form>
      <p className="hint">
        No login, no crawl of your whole site — two pages, measured live.
      </p>

      {state.status !== 'idle' && (
        <ProgressRail phase={state.phase} elapsed={state.elapsed} running={running} />
      )}

      {state.error && (
        <div className="notice error">
          <b>Could not finish.</b> {state.error}
        </div>
      )}

      {(state.url || state.title) && (
        <section className="panel">
          <h2>
            Audited
            {state.platform && isStore(state.platform) && (
              <span className="platformTag">{PLATFORM_LABELS[state.platform]} store</span>
            )}
          </h2>
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
          <h2>What we saw</h2>
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

      {state.durationMs !== null && (
        <p style={{ color: 'var(--dim)', fontSize: 13 }}>
          Completed in {(state.durationMs / 1000).toFixed(1)}s.
        </p>
      )}
    </main>
  );
}
