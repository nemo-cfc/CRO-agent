import Groq from 'groq-sdk';
import {
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

const TEMPERATURE: Record<typeof config.effort, number> = {
  low: 0.15,
  medium: 0.35,
  high: 0.55,
};

let client: Groq | null = null;
function getClient(): Groq {
  if (!client) client = new Groq({ apiKey: config.groqApiKey || undefined });
  return client;
}

const JSON_SHAPE = `Return a single JSON object (no markdown) with this shape:
{
  "summary": string,
  "recommendations": [
    {
      "title": string,
      "category": "aboveFold" | "cta" | "trust" | "forms" | "speed" | "mobile" | "copy" | "technical" | "tracking" | "friction" | "ecommerce",
      "severity": "critical" | "high" | "medium" | "low",
      "impact": "high" | "medium" | "low",
      "effort": "quick-win" | "moderate" | "significant",
      "why_it_matters": string,
      "fix": string,
      "evidence_refs": string[]
    }
  ]
}`;

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
 * rather than waiting for the whole document. Groq's json_schema mode cannot
 * stream, so we use json_object mode and extract objects as they close.
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
  let usage: RecommendResult['usage'] = null;

  const applyDelta = (delta: string) => {
    const { summary, recommendations } = extractor.push(delta);
    if (summary && !emittedSummary) {
      emittedSummary = true;
      cb.onSummary(summary);
    }
    for (const raw of recommendations) {
      const parsed = RecommendationSchema.safeParse(raw);
      if (parsed.success) cb.onRecommendation(parsed.data, index++);
    }
  };

  try {
    const stream = await getClient().chat.completions.create(
      {
        model: config.model,
        max_tokens: 8000,
        temperature: TEMPERATURE[config.effort],
        stream: true,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: `${CRO_RUBRIC}\n\n${JSON_SHAPE}` },
          {
            role: 'user',
            content: `Write the recommendations for this audit.\n\n${JSON.stringify(packet, null, 1)}`,
          },
        ],
      },
      { signal },
    );

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) applyDelta(delta);
      const u = chunk.x_groq?.usage;
      if (u) {
        usage = {
          inputTokens: u.prompt_tokens,
          outputTokens: u.completion_tokens,
          cacheRead: 0,
          cacheWrite: 0,
        };
      }
    }

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
      note: index === 0 ? 'The model returned no usable recommendations.' : null,
      usage,
    };
  } catch (err) {
    if (signal.aborted) {
      return {
        ok: index > 0,
        count: index,
        note: 'Ran out of time before the recommendations finished.',
        usage,
      };
    }
    return {
      ok: false,
      count: index,
      note: `Could not generate recommendations: ${err instanceof Error ? err.message : String(err)}`,
      usage,
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
