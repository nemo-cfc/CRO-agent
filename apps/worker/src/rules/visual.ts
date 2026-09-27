import { VISIBLE_POLICY, type Check } from '@cro/shared';
import { check, type RuleContext } from './util.js';

export function visualRules(ctx: RuleContext): Check[] {
  const out: Check[] = [];
  for (const page of ctx.evidence.pages) {
    if (!page.ok || page.error) continue;
    for (const [i, item] of (page.visualObservations ?? []).entries()) {
      const title = item.kind === 'first-view-overlay' ? 'The opening dialog covers the main heading' : item.kind === 'small-text' ? 'Give this text more reading space' : item.kind === 'low-contrast' ? 'Make this text easier to distinguish' : 'Make this action label more specific';
      const observation = item.kind === 'first-view-overlay' ? `An open dialog covers ${Math.round(item.coverage! * 100)}% of the viewport and obscures the heading “${item.text}”.` : item.kind === 'small-text' ? `The text “${item.text}” rendered at ${item.fontSize}px.` : item.kind === 'low-contrast' ? `The text “${item.text}” had a measured foreground/background contrast of ${item.contrast!.toFixed(2)}:1 on a solid background.` : `The visible action is labeled “${item.text}”.`;
      const suggestion = item.kind === 'first-view-overlay' ? 'Keep the main heading visible around the dialog or reduce its footprint. For optional promotions, delay the interruption. Preserve required consent controls. This obstruction makes the first screen harder to inspect; conversion impact was not measured.' : item.kind === 'small-text' ? 'Increase this text size and check the line wrapping on the same screen width. This is a readability recommendation, not a claim that users cannot read it.' : item.kind === 'low-contrast' ? 'Increase the difference between the text and its solid background, then recheck the rendered result. This is a targeted readability improvement, not a whole-page accessibility verdict.' : 'Use a label that names the actual destination or action. Match it to what this control really does; do not invent an offer or promise.';
      out.push(check({ id: `visual.${item.kind}.${page.role}.${page.viewport}.${i}`, category: item.kind === 'first-view-overlay' ? 'friction' : item.kind === 'generic-action' ? 'cta' : 'mobile', title, status: 'warn', weight: 0, scope: page.role,
        detail: `${observation} Observed in the initial ${page.viewport} view (${item.viewportWidth}×${item.viewportHeight}) of ${page.finalUrl}.`,
        evidence: { policy: VISIBLE_POLICY, stable: true, text: item.text, url: page.finalUrl, viewport: page.viewport, selector: item.selector, x: item.x, y: item.y, width: item.width, height: item.height, fontSize: item.fontSize, contrast: item.contrast ?? null, suggestion },
      }));
    }
  }
  return out;
}
