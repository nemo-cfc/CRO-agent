import Groq from 'groq-sdk';
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

let client: Groq | null = null;
function getClient(): Groq {
  if (!client) client = new Groq({ apiKey: config.groqApiKey || undefined, maxRetries: 2 });
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
  if (!config.groqApiKey) {
    return {
      ok: false,
      count: 0,
      note: 'GROQ_API_KEY is not set — the report shows measured checks only.',
      usage: null,
    };
  }

  const packet = buildEvidencePacket(evidence, checks, scorecard);
  const extractor = new StreamingJsonExtractor();
  let index = 0;
  let emittedSummary = false;

  try {
    const stream = await getClient().chat.completions.create({
      model: config.model,
      max_completion_tokens: 8000,
      reasoning_effort: config.effort,
      stream: true,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: CRO_RUBRIC + '\nReturn only JSON matching this schema: ' + JSON.stringify(RECOMMENDATIONS_JSON_SCHEMA) },
        { role: 'user', content: 'Write the recommendations for this audit.\n\n' + JSON.stringify(packet, null, 1) },
      ],
    }, { signal });
    let finishReason: string | null = null;
    let usage: RecommendResult['usage'] = null;
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      const u = chunk.x_groq?.usage;
      if (u) usage = { inputTokens: u.prompt_tokens, outputTokens: u.completion_tokens, cacheRead: 0, cacheWrite: 0 };
      const delta = choice?.delta?.content ?? '';
      const { summary, recommendations } = extractor.push(delta);

      if (summary && !emittedSummary) {
        emittedSummary = true;
        cb.onSummary(summary);
      }

      for (const raw of recommendations) {
        const parsed = RecommendationSchema.safeParse(raw);
        if (parsed.success) cb.onRecommendation(parsed.data, index++);
      }
    }

    if (finishReason === 'content_filter') {
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

    return {
      ok: index > 0,
      count: index,
      note:
        finishReason === 'length'
          ? 'Recommendations were cut short by the output limit.'
          : index === 0
            ? 'The model returned no usable recommendations.'
            : null,
      usage,
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
