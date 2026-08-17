/**
 * Incremental extractor for the model's streamed JSON.
 *
 * Structured outputs arrive as ordinary text deltas containing one JSON
 * document, so a naive implementation waits for the whole message and emits
 * every recommendation at once at the ~20s mark — which throws away the point
 * of streaming. This walks the buffer as it grows and hands back each
 * recommendation object the moment its closing brace arrives.
 *
 * It is a scanner, not a parser: it tracks string state and brace depth only,
 * and defers to `JSON.parse` for each complete object. Malformed output
 * therefore fails the same way it would have anyway, just earlier.
 */
export class StreamingJsonExtractor {
  #buf = '';
  #summary: string | null = null;
  #arrayStart = -1;
  #cursor = 0;
  #depth = 0;
  #objStart = -1;
  #inString = false;
  #escaped = false;
  #emitted = 0;

  /** Feed a text delta. Returns whatever became complete as a result. */
  push(chunk: string): { summary: string | null; recommendations: unknown[] } {
    this.#buf += chunk;

    const summary = this.#tryReadSummary();
    const recommendations = this.#drainArray();

    return { summary, recommendations };
  }

  get summary(): string | null {
    return this.#summary;
  }

  get count(): number {
    return this.#emitted;
  }

  /** The raw accumulated text, for a final whole-document validation pass. */
  get raw(): string {
    return this.#buf;
  }

  #tryReadSummary(): string | null {
    if (this.#summary !== null) return null;

    const key = this.#buf.indexOf('"summary"');
    if (key === -1) return null;

    const colon = this.#buf.indexOf(':', key);
    if (colon === -1) return null;

    const open = this.#buf.indexOf('"', colon);
    if (open === -1) return null;

    // Walk to the closing quote, honouring escapes.
    let i = open + 1;
    let escaped = false;
    while (i < this.#buf.length) {
      const ch = this.#buf[i];
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        try {
          this.#summary = JSON.parse(this.#buf.slice(open, i + 1)) as string;
          return this.#summary;
        } catch {
          return null;
        }
      }
      i++;
    }
    return null;
  }

  #drainArray(): unknown[] {
    if (this.#arrayStart === -1) {
      const key = this.#buf.indexOf('"recommendations"');
      if (key === -1) return [];
      const bracket = this.#buf.indexOf('[', key);
      if (bracket === -1) return [];
      this.#arrayStart = bracket;
      this.#cursor = bracket + 1;
    }

    const out: unknown[] = [];

    while (this.#cursor < this.#buf.length) {
      const ch = this.#buf[this.#cursor];

      if (this.#inString) {
        if (this.#escaped) this.#escaped = false;
        else if (ch === '\\') this.#escaped = true;
        else if (ch === '"') this.#inString = false;
        this.#cursor++;
        continue;
      }

      if (ch === '"') {
        this.#inString = true;
      } else if (ch === '{') {
        if (this.#depth === 0) this.#objStart = this.#cursor;
        this.#depth++;
      } else if (ch === '}') {
        this.#depth--;
        if (this.#depth === 0 && this.#objStart !== -1) {
          const slice = this.#buf.slice(this.#objStart, this.#cursor + 1);
          try {
            out.push(JSON.parse(slice));
            this.#emitted++;
          } catch {
            /* incomplete or malformed — the final validation pass will catch it */
          }
          this.#objStart = -1;
        }
      } else if (ch === ']' && this.#depth === 0) {
        this.#cursor++;
        break;
      }

      this.#cursor++;
    }

    return out;
  }
}
