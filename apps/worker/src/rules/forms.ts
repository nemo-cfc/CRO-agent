import type { Check } from '@cro/shared';
import { isStore } from '@cro/shared';
import { check, skipped, type RuleContext } from './util.js';

const OUTCOME_SUBMIT = /\b(get|start|book|send|join|claim|download|request|subscribe|create|reserve|continue to)\b/i;

export function formRules(ctx: RuleContext): Check[] {
  // Lead-capture advice ("four fields or fewer"). On a store the only form on
  // the audited pages is the footer newsletter signup, which is not where a
  // store converts, so these checks are not run there at all.
  if (isStore(ctx.evidence.platform)) return [];

  // Prefer whichever page actually has a form — often the key page, not home.
  const withForm =
    [ctx.keyDesktop, ctx.keyMobile, ctx.homeDesktop, ctx.homeMobile].find(
      (p) => p?.form && p.form.fields > 0,
    ) ?? null;

  if (!withForm?.form) {
    return [
      skipped(
        'forms.present',
        'forms',
        'Form friction',
        'No form was found on either audited page, so form friction does not apply.',
      ),
    ];
  }

  const f = withForm.form;
  const scope = withForm.role;
  const out: Check[] = [];

  out.push(
    check({
      id: 'forms.fieldCount',
      category: 'forms',
      title: 'Form asks for as little as possible',
      status: f.fields <= 4 ? 'pass' : f.fields <= 7 ? 'warn' : 'fail',
      weight: 1.5,
      scope,
      detail: `The main form has ${f.fields} visible field${f.fields === 1 ? '' : 's'} (${f.requiredFields} required). Each extra field measurably reduces completions; four or fewer is the target for lead capture.`,
      evidence: { fields: f.fields, required: f.requiredFields, types: f.inputTypes.join(', ') },
    }),
  );

  out.push(
    check({
      id: 'forms.labels',
      category: 'forms',
      title: 'Every field is labelled',
      status: f.unlabelledFields === 0 ? 'pass' : f.unlabelledFields <= 2 ? 'warn' : 'fail',
      weight: 1.25,
      scope,
      detail:
        f.unlabelledFields === 0
          ? 'All fields have an associated label.'
          : `${f.unlabelledFields} field${f.unlabelledFields === 1 ? ' has' : 's have'} no label. Placeholder-only fields disappear as soon as typing starts, which is a documented cause of form abandonment.`,
      evidence: { unlabelled: f.unlabelledFields, total: f.fields },
    }),
  );

  const autoRatio = f.fields > 0 ? f.fieldsWithAutocomplete / f.fields : 0;
  out.push(
    check({
      id: 'forms.autocomplete',
      category: 'forms',
      title: 'Browser autofill is enabled',
      status: autoRatio >= 0.6 ? 'pass' : autoRatio > 0 ? 'warn' : 'fail',
      scope,
      detail:
        autoRatio >= 0.6
          ? `${f.fieldsWithAutocomplete} of ${f.fields} fields declare an autocomplete attribute.`
          : `Only ${f.fieldsWithAutocomplete} of ${f.fields} fields declare autocomplete. Without it, phone users type their address by hand.`,
      evidence: { withAutocomplete: f.fieldsWithAutocomplete, total: f.fields },
    }),
  );

  out.push(
    check({
      id: 'forms.submitCopy',
      category: 'forms',
      title: 'Submit button states what happens',
      status: f.submitText ? (OUTCOME_SUBMIT.test(f.submitText) ? 'pass' : 'warn') : 'warn',
      scope,
      detail: f.submitText
        ? OUTCOME_SUBMIT.test(f.submitText)
          ? `Submit button reads "${f.submitText}".`
          : `Submit button reads "${f.submitText}". Outcome-framed copy ("Get my quote") consistently outperforms process-framed copy ("Submit").`
        : 'No submit button text found.',
      evidence: { submitText: f.submitText },
    }),
  );

  out.push(
    check({
      id: 'forms.captcha',
      category: 'forms',
      title: 'Spam protection is invisible to real users',
      status: f.hasCaptcha ? 'warn' : 'pass',
      weight: 0.75,
      scope,
      detail: f.hasCaptcha
        ? 'A visible CAPTCHA sits on the form. It stops bots, and it also stops a measurable share of genuine users — an invisible option (honeypot field or Turnstile in managed mode) protects the form without the tax.'
        : 'No visible CAPTCHA blocking the form.',
      evidence: { hasCaptcha: f.hasCaptcha },
    }),
  );

  return out;
}
