import { CATEGORIES } from './schema.js';

/**
 * JSON Schema handed to `output_config.format` on the Messages API.
 *
 * Hand-written rather than derived, because structured outputs reject several
 * things Zod emits by default: numeric constraints, string length constraints,
 * and `additionalProperties` set to anything other than `false`. Keep this in
 * sync with `RecommendationsPayloadSchema` in schema.ts — the worker validates
 * the model's output against the Zod version regardless, so a drift shows up
 * as a parse error rather than silently bad data.
 */
export const RECOMMENDATIONS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description:
        'A short scope-limited summary of directly observed findings. Never claim measured conversion losses.',
    },
    recommendations: {
      type: 'array',
      description:
        'Zero to five recommendations, ordered by strength of supplied evidence. Every one must be grounded in a check that actually failed or warned — never invent a problem the evidence does not show.',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description:
              'The change to make, as an imperative phrase under 10 words. E.g. "Move the booking button above the fold on mobile".',
          },
          category: { type: 'string', enum: [...CATEGORIES] },
          severity: {
            type: 'string',
            enum: ['critical', 'high', 'medium', 'low'],
          },
          impact: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'Conservative prioritization estimate, not measured conversion lift.',
          },
          effort: {
            type: 'string',
            enum: ['quick-win', 'moderate', 'significant'],
            description:
              'quick-win = a copy or CSS change under an hour. moderate = a day. significant = a rebuild of the section.',
          },
          why_it_matters: {
            type: 'string',
            description:
              'Two sentences maximum. Cite the measured number from the evidence, then say what it does to the visitor. No generic CRO theory.',
          },
          fix: {
            type: 'string',
            description:
              'The specific change, concrete enough to hand to a developer or copywriter. Where the fix is copy, write the actual replacement copy rather than describing it.',
          },
          evidence_refs: {
            type: 'array',
            description:
              'Ids of the checks this is grounded in, copied verbatim from the evidence packet.',
            items: { type: 'string' },
          },
        },
        required: [
          'title',
          'category',
          'severity',
          'impact',
          'effort',
          'why_it_matters',
          'fix',
          'evidence_refs',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'recommendations'],
  additionalProperties: false,
} as const;
