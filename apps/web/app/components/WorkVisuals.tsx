/**
 * Decorative animations for the "Work showcase" cards. Pure SVG + CSS
 * (styled in brand.css), hidden from assistive tech: the card copy carries
 * the meaning.
 */

/** A product page being annotated: a scan line passes and friction pins land. */
export function TeardownVisual() {
  return (
    <svg className="lp-wv lp-wv-teardown" viewBox="8 2 304 184" aria-hidden="true" focusable="false">
      <rect className="wv-frame" x="12" y="8" width="296" height="174" rx="10" />
      <path className="wv-rule" d="M12 26h296" />
      <circle className="wv-dot" cx="24" cy="17" r="2.5" /><circle className="wv-dot" cx="33" cy="17" r="2.5" /><circle className="wv-dot" cx="42" cy="17" r="2.5" />

      <rect className="wv-image" x="26" y="38" width="120" height="130" rx="6" />
      <rect className="wv-thumb" x="30" y="150" width="22" height="14" rx="2" /><rect className="wv-thumb" x="56" y="150" width="22" height="14" rx="2" /><rect className="wv-thumb" x="82" y="150" width="22" height="14" rx="2" />

      <rect className="wv-line is-strong" x="160" y="42" width="110" height="9" rx="3" />
      <rect className="wv-line" x="160" y="57" width="80" height="6" rx="3" />
      <rect className="wv-line is-price" x="160" y="74" width="44" height="10" rx="3" />
      <rect className="wv-chip" x="160" y="94" width="24" height="14" rx="4" /><rect className="wv-chip" x="188" y="94" width="24" height="14" rx="4" /><rect className="wv-chip" x="216" y="94" width="24" height="14" rx="4" />
      <rect className="wv-cta" x="160" y="118" width="134" height="20" rx="5" />
      <rect className="wv-line" x="160" y="148" width="120" height="5" rx="2.5" />
      <rect className="wv-line" x="160" y="159" width="96" height="5" rx="2.5" />

      <g className="wv-scan"><rect x="18" y="0" width="284" height="18" /></g>

      <rect className="wv-focus f1" x="22" y="34" width="128" height="138" rx="8" />
      <rect className="wv-focus f2" x="155" y="69" width="54" height="20" rx="5" />
      <rect className="wv-focus f3" x="155" y="113" width="144" height="30" rx="7" />
      <g className="wv-pin p1"><circle cx="146" cy="40" r="9" /><text x="146" y="43.5">1</text></g>
      <g className="wv-pin p2"><circle cx="209" cy="71" r="9" /><text x="209" y="74.5">2</text></g>
      <g className="wv-pin p3"><circle cx="299" cy="116" r="9" /><text x="299" y="119.5">3</text></g>
    </svg>
  );
}

/** Shoppers flow product → cart → payment; some fall away at each step. */
export function FrictionMapVisual() {
  const flow = [0, 1, 2, 3, 4, 5];
  return (
    <svg className="lp-wv lp-wv-friction" viewBox="22 42 276 124" aria-hidden="true" focusable="false">
      <path className="wv-track" d="M50 70H270" />
      <path className="wv-leak" d="M160 70q12 34 4 78" />
      <path className="wv-leak" d="M270 70q12 34 4 78" />

      {flow.map((i) => <circle key={'f' + i} className={'wv-shopper s' + i} cx="0" cy="0" r="4" />)}
      <circle className="wv-drop d1" cx="0" cy="0" r="4" />
      <circle className="wv-drop d2" cx="0" cy="0" r="4" />
      <circle className="wv-drop d3" cx="0" cy="0" r="4" />

      <g className="wv-node"><circle className="wv-halo" cx="50" cy="70" r="20" /><circle cx="50" cy="70" r="13" /><path d="M44 66h12l-1.5 9h-9z M47 66v-2a3 3 0 0 1 6 0v2" /></g>
      <g className="wv-node is-hot"><circle className="wv-halo" cx="160" cy="70" r="20" /><circle cx="160" cy="70" r="13" /><path d="M153 64h2l2.5 9h7.5l2-6h-11 M158 77.5h.01M165 77.5h.01" /></g>
      <g className="wv-node"><circle className="wv-halo" cx="270" cy="70" r="20" /><circle cx="270" cy="70" r="13" /><path d="M263 65h14v10h-14z M263 69h14" /></g>

      <g className="wv-bars">
        <rect className="b1" x="38" y="112" width="24" height="46" rx="4" />
        <rect className="b2" x="148" y="130" width="24" height="28" rx="4" />
        <rect className="b3" x="258" y="141" width="24" height="17" rx="4" />
      </g>
      <path className="wv-base" d="M24 158.5h272" />
    </svg>
  );
}
