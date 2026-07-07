// Themed, "realistic" animated snakes for the 2D board (and a shared style for 3D).
// Renders an SVG <g> with a tapering scaled body, head, eyes and a flicking tongue,
// plus a glint that travels head->tail (SVG animateMotion) for a slither shimmer.
const SVGNS = 'http://www.w3.org/2000/svg';

// per-world snake styling; a world can override via world.snakeStyle
export const SNAKE_STYLES = {
  moksha: { kind: 'realistic', body1: '#8f6c36', body2: '#463218', belly: '#cbb488', pattern: 'diamond', patternColor: '#31220f', eye: '#f0d24a', pupil: '#160d02', tongue: '#c0392b', glow: false, headW: 3.4, tailW: 0.9, glint: 'rgba(255,240,200,0.7)' },
  founders: { kind: 'tech', body1: '#0f4630', body2: '#0a2a1c', belly: '#0a2018', pattern: 'segment', patternColor: '#3ddc84', eye: '#8affc0', pupil: '#02120b', tongue: '#3ddc84', glow: true, headW: 2.9, tailW: 0.8, glint: 'rgba(120,255,180,0.95)' },
  panchatantra: { kind: 'folk', body1: '#6a9a3a', body2: '#3a5f22', belly: '#d9c98a', pattern: 'stripe', patternColor: '#2c4718', eye: '#e0a53d', pupil: '#2a1a08', tongue: '#c0392b', glow: false, headW: 3.1, tailW: 0.9, glint: 'rgba(255,240,190,0.6)' },
  habits: { kind: 'cartoon', body1: '#5ab0f5', body2: '#1e6fd0', belly: '#d3ecff', pattern: 'plain', patternColor: '#1e88e5', eye: '#ffffff', pupil: '#10314f', tongue: '#ff7043', glow: false, headW: 3.6, tailW: 1.2, smile: true, glint: 'rgba(255,255,255,0.85)' },
  default: { kind: 'realistic', body1: '#7a5c30', body2: '#3a2a12', belly: '#c9b487', pattern: 'diamond', patternColor: '#2a1c0c', eye: '#f0d24a', pupil: '#160d02', tongue: '#c0392b', glow: false, headW: 3.2, tailW: 0.9, glint: 'rgba(255,240,200,0.7)' },
};

export function getSnakeStyle(world) {
  return world.snakeStyle || SNAKE_STYLES[world.id] || SNAKE_STYLES.default;
}

const el = (name, attrs) => {
  const e = document.createElementNS(SVGNS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};

function cubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}
function cubicTan(p0, p1, p2, p3, t) {
  const u = 1 - t;
  let x = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x);
  let y = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y);
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

// a = head (higher square), b = tail (lower square). Both {x,y} in the 0..100 board space.
export function buildSnakeSvg(a, b, style, uid) {
  const s = { ...SNAKE_STYLES.default, ...style };
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len, py = dx / len; // perpendicular
  const amp = Math.min(11, len * 0.2);
  const p0 = a;
  const p1 = { x: a.x + dx * 0.33 + px * amp, y: a.y + dy * 0.33 + py * amp };
  const p2 = { x: a.x + dx * 0.66 - px * amp, y: a.y + dy * 0.66 - py * amp };
  const p3 = b;

  const N = 26;
  const centre = [];
  const tan = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    centre.push(cubic(p0, p1, p2, p3, t));
    tan.push(cubicTan(p0, p1, p2, p3, t));
  }
  const halfW = (t) => (s.headW * (1 - t) + s.tailW * t) / 2;

  // tapering closed body outline: down the left edge, back up the right edge
  const left = [], right = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const w = halfW(t);
    const nx = -tan[i].y, ny = tan[i].x; // perpendicular to tangent
    left.push({ x: centre[i].x + nx * w, y: centre[i].y + ny * w });
    right.push({ x: centre[i].x - nx * w, y: centre[i].y - ny * w });
  }
  let d = `M ${left[0].x} ${left[0].y} `;
  for (let i = 1; i <= N; i++) d += `L ${left[i].x} ${left[i].y} `;
  for (let i = N; i >= 0; i--) d += `L ${right[i].x} ${right[i].y} `;
  d += 'Z';

  const g = el('g', { class: 'snake' + (s.glow ? ' snake-glow' : '') });

  // defs: body gradient (+ glow filter)
  const defs = el('defs', {});
  const grad = el('linearGradient', { id: `sg-${uid}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, gradientUnits: 'userSpaceOnUse' });
  defs.appendChild(grad);
  grad.appendChild(el('stop', { offset: '0', 'stop-color': s.body1 }));
  grad.appendChild(el('stop', { offset: '1', 'stop-color': s.body2 }));
  g.appendChild(defs);

  // invisible centreline for the travelling glint
  const cl = el('path', { id: `cl-${uid}`, d: `M ${a.x} ${a.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${b.x} ${b.y}`, fill: 'none', stroke: 'none' });
  g.appendChild(cl);

  // body
  g.appendChild(el('path', { d, fill: `url(#sg-${uid})`, stroke: s.body2, 'stroke-width': 0.25, 'stroke-linejoin': 'round' }));

  // scale / segment pattern along the body
  const pat = el('g', { class: 'snake-pattern', 'stroke-linecap': 'round' });
  for (let i = 2; i < N - 1; i++) {
    const t = i / N;
    const c = centre[i];
    const w = halfW(t) * 0.9;
    const nx = -tan[i].y, ny = tan[i].x;
    if (s.pattern === 'diamond' && i % 2 === 0) {
      pat.appendChild(el('path', {
        d: `M ${c.x - tan[i].x * w} ${c.y - tan[i].y * w} L ${c.x + nx * w} ${c.y + ny * w} L ${c.x + tan[i].x * w} ${c.y + tan[i].y * w} L ${c.x - nx * w} ${c.y - ny * w} Z`,
        fill: s.patternColor, opacity: 0.55,
      }));
    } else if (s.pattern === 'segment') {
      pat.appendChild(el('line', { x1: c.x + nx * w, y1: c.y + ny * w, x2: c.x - nx * w, y2: c.y - ny * w, stroke: s.patternColor, 'stroke-width': 0.5, opacity: 0.85 }));
    } else if (s.pattern === 'stripe' && i % 2 === 0) {
      pat.appendChild(el('line', { x1: c.x + nx * w, y1: c.y + ny * w, x2: c.x - nx * w, y2: c.y - ny * w, stroke: s.patternColor, 'stroke-width': 0.9, opacity: 0.5 }));
    }
  }
  g.appendChild(pat);

  // belly highlight (a slim light ribbon down the middle)
  let bd = '';
  for (let i = 0; i <= N; i++) bd += (i ? 'L' : 'M') + ` ${centre[i].x} ${centre[i].y} `;
  g.appendChild(el('path', { d: bd, fill: 'none', stroke: s.belly, 'stroke-width': 0.5, opacity: 0.35, 'stroke-linecap': 'round' }));

  // travelling glint (slither shimmer)
  const glint = el('circle', { r: Math.max(0.7, s.headW * 0.32), fill: s.glint });
  const anim = el('animateMotion', { dur: '2.6s', repeatCount: 'indefinite', rotate: 'auto' });
  anim.appendChild(el('mpath', { href: `#cl-${uid}` }));
  glint.appendChild(anim);
  g.appendChild(glint);

  // ---- head ----
  const hAng = (Math.atan2(tan[0].y, tan[0].x) * 180) / Math.PI;
  const head = el('g', { transform: `translate(${a.x} ${a.y}) rotate(${hAng})` });
  const hw = s.headW * 0.75, hh = s.headW * 0.58;
  head.appendChild(el('ellipse', { cx: 0, cy: 0, rx: hw, ry: hh, fill: s.body1, stroke: s.body2, 'stroke-width': 0.25 }));
  // eyes (offset toward the front of the head, i.e. -x = forward since tangent points into body)
  for (const sgn of [-1, 1]) {
    head.appendChild(el('circle', { cx: -hw * 0.35, cy: hh * 0.55 * sgn, r: hh * 0.42, fill: s.eye }));
    head.appendChild(el('circle', { cx: -hw * 0.45, cy: hh * 0.55 * sgn, r: hh * 0.2, fill: s.pupil }));
  }
  if (s.smile) {
    head.appendChild(el('path', { d: `M ${-hw} 0 Q ${-hw * 0.4} ${hh * 0.8} 0 0`, fill: 'none', stroke: s.pupil, 'stroke-width': 0.3 }));
  }
  // forked tongue extending forward (out of the mouth); anchor holds position,
  // inner .tongue is CSS-animated so the flick transform doesn't clobber the translate
  const tongueAnchor = el('g', { transform: `translate(${-hw} 0)` });
  const tongue = el('g', { class: 'tongue' });
  tongue.appendChild(el('path', { d: `M 0 0 L -${hw * 0.95} -${hh * 0.45} M 0 0 L -${hw * 0.95} ${hh * 0.45}`, stroke: s.tongue, 'stroke-width': 0.35, fill: 'none', 'stroke-linecap': 'round' }));
  tongueAnchor.appendChild(tongue);
  head.appendChild(tongueAnchor);
  g.appendChild(head);

  return g;
}
