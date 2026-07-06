// Snake & Ladders — Original, in 3D (Three.js). Real 3D board with shifting camera
// angles (presets + drag-orbit + zoom). Reuses logic.js rules, the world manifest,
// and audio.js. Self-contained (three vendored).
import * as THREE from '../vendor/three.module.js';
import { squareToCell, rollDie, resolveMove, indexWorld } from './logic.js';
import { audio } from './audio.js';

const $ = (s) => document.querySelector(s);
const TILE = 1;
const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const tween = (dur, fn) => new Promise((res) => {
  const t0 = performance.now();
  const step = () => {
    const p = Math.min(1, (performance.now() - t0) / dur);
    fn(p);
    if (p < 1) requestAnimationFrame(step);
    else res();
  };
  requestAnimationFrame(step);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// board square -> 3D position (row 0 = front/near, row 9 = back/far)
function tilePos(n) {
  const { row, col } = squareToCell(n, 100, 10);
  return new THREE.Vector3((col - 4.5) * TILE, 0, (4.5 - row) * TILE);
}

// die euler (radians) to show value V on the +Y (top) face
const ROT = {
  1: [0, 0, 0],
  6: [Math.PI, 0, 0],
  2: [-Math.PI / 2, 0, 0],
  5: [Math.PI / 2, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
};

const PRESETS = [
  { name: 'Isometric', radius: 15, theta: Math.PI / 4, phi: 0.9, t: [0, 0, 0] },
  { name: 'Top-down', radius: 14, theta: 0, phi: 0.08, t: [0, 0, 0] },
  { name: 'Low angle', radius: 12, theta: Math.PI / 2, phi: 1.32, t: [0, 1.2, 0] },
  { name: 'Corner', radius: 16, theta: -Math.PI / 4, phi: 0.8, t: [0, 0, 0] },
  { name: 'Bird orbit', radius: 18, theta: 0, phi: 0.4, t: [0, 0, -0.5], spin: true },
];

async function main() {
  const world = await (await fetch('worlds/moksha.json')).json();
  const idx = indexWorld(world);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  $('#stage').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0704);
  scene.fog = new THREE.Fog(0x0b0704, 20, 44);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xffd9a0, 0x140c06, 0.55));
  const key = new THREE.DirectionalLight(0xffcf8a, 1.15);
  key.position.set(7, 13, 5);
  scene.add(key);
  const fill = new THREE.PointLight(0xe8783a, 0.6, 40);
  fill.position.set(-6, 5, -4);
  scene.add(fill);
  scene.add(new THREE.AmbientLight(0x3a2412, 0.5));

  const board = new THREE.Group();
  scene.add(board);

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(10.8, 0.5, 10.8),
    new THREE.MeshStandardMaterial({ color: 0x1a1008, roughness: 0.95 }),
  );
  base.position.y = -0.35;
  board.add(base);

  // ---- tiles + numbers ----
  for (let n = 1; n <= 100; n++) {
    const p = tilePos(n);
    const isL = idx.ladders.has(n);
    const isS = idx.snakes.has(n);
    const light = (Math.floor((n - 1) / 10) + ((n - 1) % 10)) % 2 === 0;
    const color = n === 100 ? 0x6a4a12 : isL ? 0x2f4a22 : isS ? 0x52241c : light ? 0x2e1c10 : 0x3a2616;
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(0.94, 0.16, 0.94),
      new THREE.MeshStandardMaterial({ color, roughness: 0.85, emissive: n === 100 ? 0x4a3208 : 0x000000 }),
    );
    tile.position.copy(p);
    board.add(tile);
    board.add(numberSprite(n, p, isL, isS));
  }

  // ---- ladders + snakes ----
  const snakeCurves = new Map(); // from -> curve
  const ladderLines = new Map(); // from -> {a,b}
  for (const l of world.ladders || []) {
    board.add(makeLadder(tilePos(l.from), tilePos(l.to)));
    ladderLines.set(l.from, { a: tilePos(l.from), b: tilePos(l.to) });
  }
  for (const s of world.snakes || []) {
    const sn = makeSnake(tilePos(s.from), tilePos(s.to));
    board.add(sn.group);
    snakeCurves.set(s.from, sn.curve);
  }

  // ---- token (pawn) ----
  const token = makePawn();
  token.position.copy(tilePos(1));
  board.add(token);

  // ---- die ----
  const die = makeDie();
  die.position.set(6.2, 0.7, 6.2);
  scene.add(die);

  // ---- camera controller (spherical) ----
  const cam = { radius: 15, theta: Math.PI / 4, phi: 0.9, t: new THREE.Vector3(0, 0, 0) };
  let camTween = null;
  let presetIdx = 0;
  applyPresetInstant(PRESETS[0]);

  function applyPresetInstant(p) {
    cam.radius = p.radius; cam.theta = p.theta; cam.phi = p.phi;
    cam.t.set(p.t[0], p.t[1], p.t[2]);
  }
  function goPreset(i) {
    presetIdx = (i + PRESETS.length) % PRESETS.length;
    const p = PRESETS[presetIdx];
    $('#viewName').textContent = p.name;
    camTween = {
      from: { radius: cam.radius, theta: cam.theta, phi: cam.phi, t: cam.t.clone() },
      to: { radius: p.radius, theta: p.theta, phi: p.phi, t: new THREE.Vector3(p.t[0], p.t[1], p.t[2]) },
      t0: performance.now(), dur: 1200,
    };
  }
  function updateCamera() {
    if (camTween) {
      const p = Math.min(1, (performance.now() - camTween.t0) / camTween.dur);
      const e = easeIO(p);
      const a = camTween.from, b = camTween.to;
      cam.radius = a.radius + (b.radius - a.radius) * e;
      cam.theta = a.theta + (b.theta - a.theta) * e;
      cam.phi = a.phi + (b.phi - a.phi) * e;
      cam.t.copy(a.t).lerp(b.t, e);
      if (p >= 1) camTween = null;
    } else if (PRESETS[presetIdx].spin) {
      cam.theta += 0.0016;
    }
    const sp = Math.max(0.05, Math.min(1.5, cam.phi));
    camera.position.set(
      cam.t.x + cam.radius * Math.sin(sp) * Math.cos(cam.theta),
      cam.t.y + cam.radius * Math.cos(sp),
      cam.t.z + cam.radius * Math.sin(sp) * Math.sin(cam.theta),
    );
    camera.lookAt(cam.t);
  }

  // drag-orbit + wheel-zoom
  let dragging = false, lx = 0, ly = 0;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
  window.addEventListener('pointerup', () => { dragging = false; });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    camTween = null;
    cam.theta -= (e.clientX - lx) * 0.006;
    cam.phi = Math.max(0.06, Math.min(1.5, cam.phi - (e.clientY - ly) * 0.006));
    lx = e.clientX; ly = e.clientY;
  });
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.radius = Math.max(7, Math.min(28, cam.radius + Math.sign(e.deltaY) * 1.2));
  }, { passive: false });

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  // ---- render loop ----
  renderer.setAnimationLoop(() => {
    updateCamera();
    token.rotation.y += 0.01;
    renderer.render(scene, camera);
  });

  // ---- game ----
  let pos = 1;
  let busy = false;
  let speakStarted = false;

  async function roll() {
    if (busy || pos >= 100) return;
    busy = true;
    $('#roll').disabled = true;
    if (!speakStarted) { audio.resume(); speakStarted = true; }
    hideCard();

    const r = rollDie();
    await rollDie3d(r);
    const res = resolveMove(pos, r, world);
    $('#status').textContent = `Rolled ${r} — step ${res.landed}`;

    const dir = res.landed > pos ? 1 : -1;
    for (let n = pos + dir; dir > 0 ? n <= res.landed : n >= res.landed; n += dir) {
      await hopTo(n);
      audio.stepNote(n);
    }
    pos = res.landed;

    if (res.hit) {
      goPreset(2); // cut to the low cinematic angle
      await wait(500);
      showCard(res.hit);
      playAudio(res.hit);
      if (res.hit.type === 'ladder') {
        const l = ladderLines.get(res.hit.from);
        await climbLadder3d(l.a, l.b);
      } else {
        await slideSnake3d(snakeCurves.get(res.hit.from));
      }
      await wait(1400);
      hideCard();
      goPreset(0); // back to isometric
      pos = res.hit.to;
    }

    $('#status').textContent = pos >= 100 ? '॥ Moksha — you have won ॥' : `On step ${pos}`;
    if (pos >= 100) $('#restart') && ($('#restart').style.display = 'inline-block');
    busy = false;
    if (pos < 100) $('#roll').disabled = false;
  }

  function hopTo(n) {
    const a = token.position.clone();
    const b = tilePos(n);
    return tween(400, (p) => {
      const e = easeIO(p);
      token.position.x = a.x + (b.x - a.x) * e;
      token.position.z = a.z + (b.z - a.z) * e;
      token.position.y = Math.sin(p * Math.PI) * 0.75;
    });
  }
  async function climbLadder3d(a, b) {
    audio.ladderGliss();
    await tween(1500, (p) => {
      const e = easeIO(p);
      token.position.x = a.x + (b.x - a.x) * e;
      token.position.z = a.z + (b.z - a.z) * e;
      token.position.y = 0.15 + Math.sin(e * Math.PI) * 0.4 + e * 0.15;
    });
    token.position.copy(b); token.position.y = 0;
  }
  async function slideSnake3d(curve) {
    audio.serpentHiss();
    await tween(1600, (p) => {
      const pt = curve.getPointAt(easeIO(p));
      token.position.copy(pt);
    });
    token.position.y = 0;
  }

  async function rollDie3d(value) {
    audio.diceRattle();
    const av = [(Math.random() * 2 - 1) * 10, (Math.random() * 2 - 1) * 10, (Math.random() * 2 - 1) * 10];
    await tween(760, (p) => {
      die.rotation.x += av[0] * 0.016;
      die.rotation.y += av[1] * 0.016;
      die.rotation.z += av[2] * 0.016;
      die.position.y = 0.7 + Math.abs(Math.sin(p * Math.PI * 3)) * 0.7;
    });
    const e = ROT[value];
    const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2]));
    const from = die.quaternion.clone();
    await tween(420, (p) => {
      die.quaternion.copy(from).slerp(target, easeIO(p));
      die.position.y = 0.7;
    });
    audio.diceClack();
  }

  // ---- HUD ----
  $('#roll').addEventListener('click', roll);
  $('#viewBtn').addEventListener('click', () => { audio.resume(); goPreset(presetIdx + 1); });
  $('#restart').addEventListener('click', () => {
    pos = 1;
    token.position.copy(tilePos(1)); token.position.y = 0;
    $('#restart').style.display = 'none';
    $('#roll').disabled = false;
    $('#status').textContent = 'On step 1';
    goPreset(0);
  });
  $('#muteBtn').addEventListener('click', () => {
    const on = audio.toggle();
    $('#muteBtn').textContent = on ? '🔊' : '🔇';
  });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); roll(); } });

  window.__sl3dReady = true;
  window.__sl3d = {
    getPos: () => pos,
    setView: (i) => goPreset(i),
    presetName: () => PRESETS[presetIdx].name,
    rendererInfo: () => renderer.info.render.triangles,
  };
}

// ---------- factory helpers ----------
function numberSprite(n, p, isL, isS) {
  const c = document.createElement('canvas');
  c.width = c.height = 72;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 72, 72);
  x.fillStyle = isL ? '#bfe08a' : isS ? '#ffb3a0' : '#e6d3ab';
  x.font = 'bold 34px Georgia';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(String(n), 36, 38);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.position.set(p.x, 0.14, p.z);
  s.scale.set(0.62, 0.62, 0.62);
  return s;
}

function cylinderBetween(p1, p2, r, mat) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
  m.position.copy(p1).add(p2).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return m;
}

function makeLadder(a, b) {
  const g = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.22);
  const mat = new THREE.MeshStandardMaterial({ color: 0xd9b64e, roughness: 0.4, metalness: 0.35, emissive: 0x3a2a08 });
  for (const s of [1, -1]) {
    const a2 = a.clone().add(perp.clone().multiplyScalar(s)); a2.y = 0.16;
    const b2 = b.clone().add(perp.clone().multiplyScalar(s)); b2.y = 1.05;
    g.add(cylinderBetween(a2, b2, 0.05, mat));
  }
  const rungs = Math.max(3, Math.round(len / 0.75));
  for (let i = 1; i < rungs; i++) {
    const t = i / rungs;
    const c = a.clone().lerp(b, t); c.y = 0.16 + (1.05 - 0.16) * t;
    g.add(cylinderBetween(c.clone().add(perp), c.clone().sub(perp), 0.04, mat));
  }
  return g;
}

function makeSnake(a, b) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const N = 6;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const c = a.clone().lerp(b, t);
    c.y = 0.32 + Math.sin(t * Math.PI) * 0.45;
    c.add(perp.clone().multiplyScalar(Math.sin(t * Math.PI * 2) * 0.5));
    pts.push(c);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const mat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5, emissive: 0x3a0a06 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.17, 8, false), mat));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 14), mat);
  head.position.copy(pts[0]);
  g.add(head);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0x554422 });
  for (const s of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
    eye.position.copy(pts[0]).add(perp.clone().multiplyScalar(0.14 * s)).add(new THREE.Vector3(0, 0.12, 0));
    g.add(eye);
  }
  return { group: g, curve };
}

function makePawn() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffcf7a, roughness: 0.3, metalness: 0.45, emissive: 0x5a3e0c });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.2, 20), mat); base.position.y = 0.1; g.add(base);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.24, 0.5, 20), mat); body.position.y = 0.46; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 18), mat); head.position.y = 0.82; g.add(head);
  return g;
}

function pipTexture(v) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#f0e2c0'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#6b4a22'; x.lineWidth = 6; x.strokeRect(3, 3, 122, 122);
  x.fillStyle = '#3a1e0a';
  const P = 26, M = 64, Q = 102;
  const layout = {
    1: [[M, M]], 2: [[P, P], [Q, Q]], 3: [[P, P], [M, M], [Q, Q]],
    4: [[P, P], [Q, P], [P, Q], [Q, Q]], 5: [[P, P], [Q, P], [M, M], [P, Q], [Q, Q]],
    6: [[P, P], [Q, P], [P, M], [Q, M], [P, Q], [Q, Q]],
  };
  for (const [px, py] of layout[v]) {
    x.beginPath(); x.arc(px, py, 12, 0, Math.PI * 2); x.fill();
  }
  return new THREE.CanvasTexture(c);
}

function makeDie() {
  // BoxGeometry face order: +x,-x,+y,-y,+z,-z  ->  3,4,1,6,2,5 (opposite faces sum to 7)
  const mats = [3, 4, 1, 6, 2, 5].map((v) => new THREE.MeshStandardMaterial({ map: pipTexture(v), roughness: 0.5 }));
  return new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mats);
}

// ---- HTML card + audio (reuse Moksha narration) ----
function showCard(hit) {
  $('#cKind').textContent = hit.type === 'ladder' ? 'Virtue · Ladder' : 'Vice · Serpent';
  $('#cKind').className = 'kind ' + hit.type;
  $('#cName').textContent = hit.name;
  $('#cEn').textContent = hit.en ? '— ' + hit.en : '';
  $('#cMeaning').textContent = hit.meaning;
  $('#card').classList.add('show');
}
function hideCard() { $('#card').classList.remove('show'); }
let audioEl = null;
function playAudio(hit) {
  try {
    if (audioEl) audioEl.pause();
    audioEl = new Audio(`assets/moksha/audio/${hit.type}-${hit.from}.mp3`);
    audioEl.play().catch(() => {});
  } catch { /* ignore */ }
}

main();
