// First-run coach-mark tour for the lobby: a spotlight overlay that walks a new
// player through picking a theme, a mode, players, typing a name, and starting.
// Self-contained (injects its own styles + DOM). Shows once (localStorage), with a
// small "?" button to replay it any time. Nothing here touches the game itself.

const KEY = 'sopana.tour.v1';
const $ = (s) => document.querySelector(s);
const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const STEPS = [
  {
    target: null,
    kind: 'Welcome',
    title: '॥ Welcome to Sopāna ॥',
    body: 'A Snakes &amp; Ladders that teaches. Let’s set up your first game — it only takes a few taps.',
    primary: 'Show me →',
  },
  {
    target: '#themes',
    kind: 'Step 1',
    title: 'Pick a world',
    body: 'Each theme re-themes the whole game — its board art, story, characters, narration and music.',
  },
  {
    target: '#modes',
    kind: 'Step 2',
    title: 'Choose how to play',
    body: 'Board is the classic 2D grid, Cinematic is a backlit shadow-theatre, and 3D is a real three-dimensional board.',
  },
  {
    target: '#counts',
    kind: 'Step 3',
    title: 'How many players?',
    body: 'Play solo, or pass-and-play with up to 4 people taking turns on one device.',
  },
  {
    target: '#players .pname',
    fallback: '#players',
    kind: 'Step 4',
    title: 'Add your name',
    body: 'Tap here and type each player’s name, then pick a character token beside it.',
  },
  {
    target: '#begin',
    kind: 'Ready!',
    title: 'Begin the ascent',
    body: 'All set — tap this to start climbing. 🎲 Land on a virtue to rise, a vice to fall.',
    primary: 'Got it',
  },
];

function injectStyles() {
  if ($('#ob-style')) return;
  const s = document.createElement('style');
  s.id = 'ob-style';
  s.textContent = `
    .ob-block{position:fixed;inset:0;z-index:9998;cursor:pointer;background:transparent}
    .ob-hole{position:fixed;z-index:9999;border-radius:14px;box-shadow:0 0 0 9999px rgba(6,4,2,.80);outline:2px solid #e8a33d;outline-offset:0;pointer-events:none;transition:${reduce ? 'none' : 'left .25s ease,top .25s ease,width .25s ease,height .25s ease'}}
    .ob-hole::after{content:'';position:absolute;inset:-4px;border-radius:16px;border:2px solid rgba(255,217,138,.7);opacity:.9;${reduce ? '' : 'animation:ob-pulse 1.6s ease-out infinite'}}
    @keyframes ob-pulse{0%{box-shadow:0 0 0 0 rgba(232,163,61,.5)}70%{box-shadow:0 0 0 12px rgba(232,163,61,0)}100%{box-shadow:0 0 0 0 rgba(232,163,61,0)}}
    .ob-tip{position:fixed;z-index:10000;width:min(330px,88vw);background:linear-gradient(180deg,#231208,#160c05);border:1px solid rgba(232,163,61,.5);border-radius:16px;padding:1rem 1.1rem;box-shadow:0 24px 60px rgba(0,0,0,.6);color:#f4e6cd;font-family:'Georgia','Noto Serif',serif;${reduce ? '' : 'transition:left .25s ease,top .25s ease'}}
    .ob-tip .ob-k{font-size:.7rem;letter-spacing:.16em;text-transform:uppercase;color:#e8a33d}
    .ob-tip h3{margin:.25rem 0 .35rem;color:#ffd98a;font-size:1.2rem;letter-spacing:.02em}
    .ob-tip p{margin:0;color:#e8cfa0;font-size:.95rem;line-height:1.5}
    .ob-dots{display:flex;gap:.3rem;align-items:center}
    .ob-dots i{width:7px;height:7px;border-radius:50%;background:rgba(232,163,61,.35)}
    .ob-dots i.on{background:#e8a33d}
    .ob-row{display:flex;align-items:center;justify-content:space-between;gap:.6rem;margin-top:1rem}
    .ob-btns{display:flex;gap:.5rem}
    .ob-b{font:inherit;cursor:pointer;border-radius:10px;padding:.5rem .95rem;min-height:42px;border:1px solid rgba(232,163,61,.4);background:rgba(255,255,255,.05);color:#f4e6cd}
    .ob-b:hover{border-color:#e8a33d}
    .ob-b.primary{background:linear-gradient(180deg,#ffcf7a,#e8a33d);color:#241200;border:0;font-weight:bold}
    .ob-b.skip{background:transparent;border:0;color:#b79b74;padding:.5rem .4rem}
    .ob-b:focus-visible{outline:3px solid #ffd98a;outline-offset:2px}
    .ob-help{position:fixed;right:calc(.8rem + env(safe-area-inset-right,0px));bottom:calc(.8rem + env(safe-area-inset-bottom,0px));z-index:50;width:46px;height:46px;border-radius:50%;font-size:1.3rem;line-height:1;display:grid;place-items:center;cursor:pointer;color:#241200;background:linear-gradient(180deg,#ffcf7a,#e8a33d);border:0;box-shadow:0 8px 22px rgba(232,163,61,.45)}
    .ob-help:focus-visible{outline:3px solid #ffd98a;outline-offset:3px}
    @media (max-width:520px){.ob-tip{width:92vw}}
  `;
  document.head.appendChild(s);
}

let block, hole, tip, idx = 0, active = false, keyHandler, repos;

function buildDom() {
  block = document.createElement('div');
  block.className = 'ob-block';
  block.addEventListener('click', () => go(idx + 1));

  hole = document.createElement('div');
  hole.className = 'ob-hole';

  tip = document.createElement('div');
  tip.className = 'ob-tip';
  tip.setAttribute('role', 'dialog');
  tip.setAttribute('aria-modal', 'true');
  tip.setAttribute('aria-labelledby', 'ob-title');
  tip.addEventListener('click', (e) => e.stopPropagation());
}

function currentTarget() {
  const st = STEPS[idx];
  if (!st.target) return null;
  return document.querySelector(st.target) || (st.fallback ? document.querySelector(st.fallback) : null);
}

function render() {
  const st = STEPS[idx];
  const last = idx === STEPS.length - 1;
  const dots = STEPS.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('');
  tip.innerHTML = `
    <div class="ob-k">${st.kind} · ${idx + 1}/${STEPS.length}</div>
    <h3 id="ob-title">${st.title}</h3>
    <p>${st.body}</p>
    <div class="ob-row">
      <div class="ob-dots">${dots}</div>
      <div class="ob-btns">
        <button class="ob-b skip" data-act="skip">Skip</button>
        ${idx > 0 ? '<button class="ob-b" data-act="back">Back</button>' : ''}
        <button class="ob-b primary" data-act="next">${st.primary || (last ? 'Done' : 'Next →')}</button>
      </div>
    </div>`;
  tip.querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = b.getAttribute('data-act');
      if (a === 'skip') return close(true);
      if (a === 'back') return go(idx - 1);
      return go(idx + 1);
    });
  });
  position();
  const primary = tip.querySelector('.ob-b.primary');
  if (primary) primary.focus();
}

function position() {
  const t = currentTarget();
  if (!t) {
    hole.style.display = 'none';
    tip.style.left = '50%';
    tip.style.top = '50%';
    tip.style.transform = 'translate(-50%,-50%)';
    return;
  }
  hole.style.display = 'block';
  tip.style.transform = 'none';
  t.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  const settle = reduce ? 0 : 280;
  setTimeout(measure, settle);
}

function measure() {
  const t = currentTarget();
  if (!t || !active) return;
  const r = t.getBoundingClientRect();
  const pad = 8;
  const hx = r.left - pad, hy = r.top - pad, hw = r.width + pad * 2, hh = r.height + pad * 2;
  hole.style.left = hx + 'px';
  hole.style.top = hy + 'px';
  hole.style.width = hw + 'px';
  hole.style.height = hh + 'px';

  const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 14;
  let top = hy + hh + gap;
  if (top + th > window.innerHeight - 8) top = hy - th - gap;         // flip above
  if (top < 8) top = Math.min(window.innerHeight - th - 8, hy + hh + gap);
  let left = hx + hw / 2 - tw / 2;
  left = Math.min(Math.max(8, left), window.innerWidth - tw - 8);
  tip.style.left = left + 'px';
  tip.style.top = Math.max(8, top) + 'px';
}

function go(i) {
  if (i < 0) return;
  if (i >= STEPS.length) return close(true);
  idx = i;
  render();
}

function start(force) {
  if (active) return;
  if (!force && localStorage.getItem(KEY)) return;
  injectStyles();
  buildDom();
  idx = 0;
  active = true;
  document.body.append(block, hole, tip);
  keyHandler = (e) => {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
  };
  repos = () => measure();
  document.addEventListener('keydown', keyHandler);
  window.addEventListener('resize', repos);
  window.addEventListener('scroll', repos, { passive: true });
  render();
}

function close(markDone) {
  if (!active) return;
  active = false;
  document.removeEventListener('keydown', keyHandler);
  window.removeEventListener('resize', repos);
  window.removeEventListener('scroll', repos);
  [block, hole, tip].forEach((n) => n && n.remove());
  if (markDone) { try { localStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ } }
  const help = $('.ob-help');
  if (help) help.focus();
}

function addHelpButton() {
  if ($('.ob-help')) return;
  injectStyles();
  const b = document.createElement('button');
  b.className = 'ob-help';
  b.type = 'button';
  b.textContent = '❔';
  b.title = 'How to play';
  b.setAttribute('aria-label', 'How to play — replay the intro tour');
  b.addEventListener('click', () => start(true));
  document.body.appendChild(b);
}

// Wait until the lobby has rendered its controls, then add the help button and
// auto-run the tour on first visit.
function whenReady(cb) {
  let done = false;
  const fire = () => { if (done) return; done = true; cb(); };
  document.addEventListener('sopana:lobby-ready', fire, { once: true });
  const t0 = Date.now();
  const poll = () => {
    if (done) return;
    if (document.querySelector('#themes .card') && document.querySelector('#players .prow')) return fire();
    if (Date.now() - t0 > 5000) return fire();
    setTimeout(poll, 150);
  };
  poll();
}

whenReady(() => {
  addHelpButton();
  start(false);
});
