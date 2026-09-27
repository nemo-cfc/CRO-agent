import { isRecommendable, visibleSummary } from '@cro/shared';
import { groundedRecommendation } from './publication.js';
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
  cb.onSummary(visibleSummary(checks));
  if (!checks.some(isRecommendable)) return { ok: true, count: 0, note: null, usage: null };
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
  const emitted = new Set<string>();
  const publish = (candidate: Recommendation) => {
    const rec = groundedRecommendation(candidate, checks);
    if (!rec || index >= 5 || rec.evidence_refs.some(id => emitted.has(id))) return;
    rec.evidence_refs.forEach(id => emitted.add(id));
    cb.onRecommendation(rec, index++);
  };

  try {
    const stream = await getClient().chat.completions.create({
      model: config.model,
      // Reserved answer length counts against the per-minute token limit.
      max_completion_tokens: 3000,
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

      // Unvalidated model summaries are never published.

      for (const raw of recommendations) {
        const parsed = RecommendationSchema.safeParse(raw);
        if (parsed.success) publish(parsed.data);
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

        whole.data.recommendations.forEach(publish);
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
    // The raw provider error can include account details; it goes to the
    // worker log only, and the report gets a plain explanation.
    const message = err instanceof Error ? err.message : String(err);
    console.error('[recommend] model call failed:', message);
    const limited = /\b(413|429)\b|rate.?limit|tokens per minute/i.test(message);
    return {
      ok: false,
      count: index,
      note: limited
        ? 'Written recommendations are temporarily unavailable (the AI usage limit was reached). The checks above are complete.'
        : 'Written recommendations could not be generated this time. The checks above are complete.',
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
