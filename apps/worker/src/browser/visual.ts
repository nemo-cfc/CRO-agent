import type { VisualObservation } from '@cro/shared';

/** Serialized into the page: no imported runtime helpers. Fail closed on ambiguity. */
export function collectVisualObservations(): VisualObservation[] {
  const observations: VisualObservation[] = [];
  const started = performance.now();
  const width = innerWidth, height = innerHeight;
  const color = (value: string): number[] | null => {
    const match = value.match(/^rgba?\(([^)]+)\)$/);
    if (!match) return null;
    const parts = match[1]!.split(',').map(Number);
    return parts.length >= 3 && parts.every(Number.isFinite) ? parts : null;
  };
  const luminance = (rgb: number[]) => {
    const linear = rgb.slice(0, 3).map(v => v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  };
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('p, a, button, label, h1, h2, h3, span, li'));
  for (const el of nodes.slice(0, 1800)) {
    if (performance.now() - started > 40) break;
    // Only literal leaf text: no aria-only label, descendants or hidden text.
    if (el.children.length || el.closest('footer, [aria-hidden="true"], [inert], [disabled]')) continue;
    const label = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (label.length < 3 || label.length > 180) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.left < 0 || rect.top < 0 || rect.right > width || rect.bottom > height) continue;
    let safe = true;
    let background: number[] | null = null;
    let backgroundOwner: Element | null = null;
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) !== 1 || style.transform !== 'none' || style.filter !== 'none' || style.mixBlendMode !== 'normal' || style.clipPath !== 'none' || style.textShadow !== 'none' || node.getAnimations().some(a => a.playState === 'running')) { safe = false; break; }
      // Pseudo-elements and image/gradient backgrounds require rendered-pixel analysis.
      for (const pseudo of ['::before', '::after']) {
        const content = getComputedStyle(node, pseudo).content;
        if (content && content !== 'none' && content !== 'normal') safe = false;
      }
      if (style.backgroundImage !== 'none') safe = false;
      const bg = color(style.backgroundColor);
      if (!background && bg) {
        const alpha = bg[3] ?? 1;
        if (alpha !== 0 && alpha !== 1) safe = false;
        if (alpha === 1) { background = bg; backgroundOwner = node; }
      }
    }
    if (!safe) continue;
    // The ancestor colour is only the real background if nothing is painted
    // between it and the text. Hero text usually sits over a separate <img> or
    // <video> element, which the ancestor walk cannot see; white text over a
    // photo was being reported as 1.07:1 "on a solid background".
    {
      // Overlap test rather than hit-testing: hero images are usually
      // pointer-events:none, which elementsFromPoint skips.
      const root = backgroundOwner ?? document.body;
      for (const layer of Array.from(root.querySelectorAll('img, video, picture, canvas, iframe, [style*="background"]')).slice(0, 400)) {
        if (layer.contains(el) || el.contains(layer)) continue;
        const q = layer.getBoundingClientRect();
        if (q.width <= 0 || q.height <= 0 || q.left >= rect.right || q.right <= rect.left || q.top >= rect.bottom || q.bottom <= rect.top) continue;
        if (/^(IMG|VIDEO|PICTURE|CANVAS|IFRAME)$/i.test(layer.tagName) || getComputedStyle(layer).backgroundImage !== 'none') {
          safe = false;
          break;
        }
      }
    }
    if (!safe) continue;
    // All sampled points must hit this element, not a modal, sticky header or clip.
    if (![[.1,.2],[.9,.2],[.5,.5],[.1,.8],[.9,.8]].every(([x,y]) => document.elementFromPoint(rect.left + rect.width*x!, rect.top + rect.height*y!) === el)) continue;
    const style = getComputedStyle(el);
    const fontSize = parseFloat(style.fontSize);
    const selector = (() => {
      const parts: string[] = [];
      for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
        if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
        const parent = node.parentElement;
        if (!parent) break;
        parts.unshift(node.tagName.toLowerCase() + ':nth-child(' + (Array.from(parent.children).indexOf(node) + 1) + ')');
      }
      return parts.join(' > ');
    })();
    const base = { text: label, selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height, viewportWidth: width, viewportHeight: height, fontSize };
    if (fontSize > 0 && fontSize < 12 && label.length >= 12) observations.push({ ...base, kind: 'small-text' });
    const fg = color(style.color);
    if (background && fg && (fg[3] ?? 1) === 1) {
      const a = luminance(fg), b = luminance(background);
      const ratio = (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
      const threshold = fontSize >= 24 || (fontSize >= 18.667 && parseInt(style.fontWeight,10) >= 700) ? 3 : 4.5;
      if (ratio < threshold) observations.push({ ...base, kind: 'low-contrast', contrast: ratio, contrastThreshold: threshold });
    }
    if ((el.tagName === 'BUTTON' || el.tagName === 'A') && /^(click here|submit|go|more)$/i.test(label) && !el.closest('nav, header')) observations.push({ ...base, kind: 'generic-action' });
    if (observations.length >= 12) break;
  }
  // A dialog is a finding only when it actually covers a visible main heading.
  // No claim is made that all banners are harmful or that a consent step is optional.
  for (const dialog of Array.from(document.querySelectorAll<HTMLElement>('dialog[open], [role="dialog"][aria-modal="true"]'))) {
    if (performance.now() - started > 60) break;
    const style = getComputedStyle(dialog), rect = dialog.getBoundingClientRect();
    if (!['fixed','absolute'].includes(style.position) || style.visibility !== 'visible' || style.display === 'none' || Number(style.opacity) !== 1) continue;
    const dialogBackground = color(style.backgroundColor);
    if (!dialogBackground || (dialogBackground[3] ?? 1) !== 1 || style.backgroundImage !== 'none') continue;
    let solidDialog = true;
    for (let ancestor: Element | null = dialog; ancestor; ancestor = ancestor.parentElement) {
      const appearance = getComputedStyle(ancestor);
      if (Number(appearance.opacity) !== 1 || appearance.filter !== 'none' || appearance.mixBlendMode !== 'normal' || appearance.visibility !== 'visible') solidDialog = false;
    }
    if (!solidDialog) continue;
    if (dialog.getAnimations({ subtree: true }).some(a => a.playState === 'running')) continue;
    const coverage = Math.max(0,Math.min(width,rect.right)-Math.max(0,rect.left))*Math.max(0,Math.min(height,rect.bottom)-Math.max(0,rect.top))/(width*height);
    if (coverage < .4) continue;
    const heading = Array.from(document.querySelectorAll<HTMLElement>('main h1, [role="main"] h1, h1')).find(el => {
      if(dialog.contains(el))return false;
      for (let ancestor: Element | null = el; ancestor; ancestor = ancestor.parentElement) {
        const appearance = getComputedStyle(ancestor);
        if (Number(appearance.opacity) !== 1 || appearance.visibility !== 'visible' || appearance.display === 'none') return false;
      }
      const r=el.getBoundingClientRect(),s=getComputedStyle(el);
      if(r.width<=0||r.height<=0||r.left<0||r.top<0||r.right>width||r.bottom>height||s.visibility!=='visible'||s.display==='none')return false;
      return [[.2,.5],[.5,.5],[.8,.5]].every(([x,y])=>{const hit=document.elementFromPoint(r.left+r.width*x!,r.top+r.height*y!);return hit&&dialog.contains(hit);});
    });
    const headingText=(heading?.textContent??'').replace(/\s+/g,' ').trim();
    if(!heading || !headingText || headingText.length>180)continue;
    const index=Array.from(document.querySelectorAll('dialog[open], [role="dialog"][aria-modal="true"]')).indexOf(dialog);
    observations.push({kind:'first-view-overlay',text:headingText,selector:dialog.id?'#'+CSS.escape(dialog.id):`dialog-candidate-${index}`,x:rect.x,y:rect.y,width:rect.width,height:rect.height,viewportWidth:width,viewportHeight:height,fontSize:parseFloat(getComputedStyle(heading).fontSize),coverage});
  }
  return observations.slice(0,16);
}

/** A finding must survive a second sample of the same rendered state. */
export function stableVisualObservations(first: VisualObservation[], second: VisualObservation[]) {
  return second.filter(b => first.some(a => a.kind === b.kind && a.selector === b.selector && a.text === b.text && a.fontSize === b.fontSize && a.contrast === b.contrast && a.coverage === b.coverage && a.viewportWidth === b.viewportWidth && a.viewportHeight === b.viewportHeight && Math.abs(a.x-b.x) <= 1 && Math.abs(a.y-b.y) <= 1 && Math.abs(a.width-b.width) <= 1 && Math.abs(a.height-b.height) <= 1));
}
