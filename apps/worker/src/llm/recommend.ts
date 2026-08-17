import Anthropic from '@anthropic-ai/sdk';
import {
  RECOMMENDATIONS_JSON_SCHEMA,
  RecommendationSchema,
  RecommendationsPayloadSchema,
  type AuditEvidence,
  type Check,
  type Recommendation,
  type Scorecard,
} from '@cro/shared';
import { config } from '../config.js';
import { CRO_RUBRIC } from './prompt.js';
import { buildEvidencePacket } from './evidence-packet.js';
import { StreamingJsonExtractor } from './stream-parse.js';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: config.anthropicApiKey || undefined });
  return client;
}

export interface RecommendCallbacks {
  onSummary(text: string): void;
  onRecommendation(rec: Recommendation, index: number): void;
}

export interface RecommendResult {
  ok: boolean;
  count: number;
  note: string | null;
  usage: { inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number } | null;
}

/**
 * The only model call in the pipeline. The rule engine has already scored the
 * page; this turns those findings into prioritised, written recommendations.
 *
 * Streams so the frontend can render each recommendation as it completes
 * rather than waiting for the whole document.
 */
export async function writeRecommendations(
  evidence: AuditEvidence,
  checks: Check[],
  scorecard: Scorecard,
  signal: AbortSignal,
  cb: RecommendCallbacks,
): Promise<RecommendResult> {
  if (!config.anthropicApiKey) {
    return {
      ok: false,
      count: 0,
      note: 'ANTHROPIC_API_KEY is not set — the report shows measured checks only.',
      usage: null,
    };
  }

  const packet = buildEvidencePacket(evidence, checks, scorecard);
  const extractor = new StreamingJsonExtractor();
  let index = 0;
  let emittedSummary = false;

  try {
    const stream = getClient().messages.stream(
      {
        model: config.model,
        max_tokens: 8000,
        output_config: {
          // Latency lever, not a quality lever: the hard analysis already
          // happened in the rule engine. Sweep low -> medium with `npm run bench`.
          effort: config.effort,
          format: { type: 'json_schema', schema: RECOMMENDATIONS_JSON_SCHEMA },
        },
        // Adaptive thinking is left at its default. Disabling it on Opus 5 can
        // leak <thinking> tags into the output, and `effort` is the cheaper
        // control for the latency we actually care about.
        system: [
          {
            type: 'text',
            text: CRO_RUBRIC,
            // Byte-identical across audits, so every run after the first reads
            // the rubric from cache at ~0.1x input cost.
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Write the recommendations for this audit.\n\n${JSON.stringify(packet, null, 1)}`,
          },
        ],
      },
      { signal },
    );

    stream.on('text', (delta) => {
      const { summary, recommendations } = extractor.push(delta);

      if (summary && !emittedSummary) {
        emittedSummary = true;
        cb.onSummary(summary);
      }

      for (const raw of recommendations) {
        const parsed = RecommendationSchema.safeParse(raw);
        if (parsed.success) cb.onRecommendation(parsed.data, index++);
      }
    });

    const final = await stream.finalMessage();

    if (final.stop_reason === 'refusal') {
      return {
        ok: false,
        count: index,
        note: 'The model declined to write recommendations for this site.',
        usage: null,
      };
    }

    // Whole-document validation. The streamed items were validated one at a
    // time; this catches a truncated array that the scanner could not see.
    if (index === 0) {
      const whole = RecommendationsPayloadSchema.safeParse(safeJson(extractor.raw));
      if (whole.success) {
        if (!emittedSummary) cb.onSummary(whole.data.summary);
        whole.data.recommendations.forEach((r) => cb.onRecommendation(r, index++));
      }
    }

    const u = final.usage;
    return {
      ok: index > 0,
      count: index,
      note:
        final.stop_reason === 'max_tokens'
          ? 'Recommendations were cut short by the output limit.'
          : index === 0
            ? 'The model returned no usable recommendations.'
            : null,
      usage: {
        inputTokens: u.input_tokens,
        outputTokens: u.output_tokens,
        cacheRead: u.cache_read_input_tokens ?? 0,
        cacheWrite: u.cache_creation_input_tokens ?? 0,
      },
    };
  } catch (err) {
    if (signal.aborted) {
      return {
        ok: index > 0,
        count: index,
        note: 'Ran out of time before the recommendations finished.',
        usage: null,
      };
    }
    return {
      ok: false,
      count: index,
      note: `Could not generate recommendations: ${err instanceof Error ? err.message : String(err)}`,
      usage: null,
    };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
