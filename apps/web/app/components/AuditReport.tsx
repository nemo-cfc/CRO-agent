'use client';
import type { ReportState } from '@/lib/report-state';
import { ROLE_LABELS } from '@cro/shared';
import { Scorecard } from './Scorecard';
import { PerformancePanel } from './PerformancePanel';
import { ChecksPanel } from './ChecksPanel';
import { Recommendations } from './Recommendations';
import '../report.css';
export default function AuditReport({state,createdAt,partial}:{state:ReportState;createdAt:string;partial:boolean}){
 const issues=state.checks.filter(c=>c.status==='fail'||c.status==='warn').length;
 const passed=state.checks.filter(c=>c.status==='pass').length;
 let domain=state.url||'Your store';try{domain=new URL(domain).hostname;}catch{}
 return <div className="mm-report"><div className="mm-watermark" aria-hidden="true">monkeyman</div><main className="mm-sheet">
 <nav className="mm-top"><a className="mm-logo" href="/">monkey<span>man</span></a><span>STORE INTELLIGENCE / CRO AUDIT</span></nav>
 <header className="mm-cover"><div><div className="mm-eyebrow">A clearer path to conversion</div><h1>Your store.<br/><em>Its next chapter.</em></h1><p className="mm-domain">{domain}</p><p className="mm-date">Prepared {new Date(createdAt).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})} by Monkeyman</p></div><div className="mm-seal"><span>CONVERSION HEALTH</span><strong>{state.scorecard?.overall??'--'}</strong><small>out of 100</small><p>Measured signals.<br/>Practical next steps.</p></div></header>
 <div className="mm-stats"><div><strong>{state.checks.length}</strong><span>checks performed</span></div><div><strong>{issues}</strong><span>areas to improve</span></div><div><strong>{passed}</strong><span>checks passed</span></div><div><strong>{state.targets.length}</strong><span>pages inspected</span></div></div>
 {partial&&<div className="notice">This is a partial audit. Some pages or written recommendations could not be completed. The measurements below remain available.</div>}
 <div className="mm-sectionlabel">01 / YOUR PRIORITIES</div>
 <Recommendations summary={state.summary} recommendations={state.recommendations} writing={false}/>
 {!state.recommendations.length&&<section className="panel"><h2>Start with the measured findings</h2><p>Written recommendations were unavailable for this run. Review the failed and warning checks below for the evidence we collected.</p></section>}
 <div className="mm-sectionlabel">02 / THE SCORE BREAKDOWN</div>{state.scorecard&&<Scorecard scorecard={state.scorecard}/>}
 <div className="mm-sectionlabel">03 / THE EVIDENCE</div>{state.checks.length>0&&<><PerformancePanel checks={state.checks}/><ChecksPanel checks={state.checks}/></>}
 {state.shots.length>0&&<section className="panel"><h2>A view of your storefront</h2><div className="shots">{state.shots.map(s=><figure className="shot" key={s.role+s.viewport}><figcaption>{ROLE_LABELS[s.role]} / {s.viewport}</figcaption><div className="mm-shot"><img src={s.dataUri} alt={ROLE_LABELS[s.role]+' on '+s.viewport}/><span aria-hidden="true">monkeyman</span></div></figure>)}</div></section>}
 <section className="panel mm-method"><h2>What this report covers</h2><p>This automated audit evaluates public-page signals. Scores are diagnostic indicators, not a prediction of revenue or a guarantee of conversion lift. Validate proposed changes through testing.</p><ul>{state.targets.map(t=><li key={t.url+t.role}><b>{ROLE_LABELS[t.role]}</b> <a href={t.url} target="_blank" rel="noopener noreferrer">{t.url}</a></li>)}</ul>{state.notes.map((n,i)=><p key={i}>{n}</p>)}</section>
 <footer className="mm-footer"><div className="mm-logo">monkey<span>man</span></div><p>Good stores keep growing.</p><a href="mailto:hello@monkeyman.agency">hello@monkeyman.agency</a></footer>
 </main></div>;
}
