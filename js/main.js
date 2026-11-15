import * as THREE from '../vendor/three.module.min.js';
import {
  STICKERS, CENTERS, solvedColors, applyMove, isSolved, moveId, moveParts,
  inverseMove, moveName, parseMove, randomScramble,
} from './cube.js';
import { solve, STAGE_COUNT } from './solver.js';

const $ = (id) => document.getElementById(id);
const HALF_PI = Math.PI / 2;

// --- Zustand ------------------------------------------------------------------

const DEFAULT_VIEW = { pitch: 0.5, yaw: -0.65 };
const HISTORY_MAX = 400;
const MOVE_CHARS = 'abcdefghijklmnopqrstuvwxyzA';

const state = {
  colors: solvedColors(),
  moves: 0,
  history: [],
  helper: false,
  ...DEFAULT_VIEW,
};
let zoom = 1;
let plan = null;      // [{ move, stage }] – Rest der Lösung
let autoplay = false;

// --- Speichern im Cookie ----------------------------------------------------

const COOKIE = 'rubik';

function save() {
  const data = [
    state.colors.join(''),
    state.moves,
    state.pitch.toFixed(3),
    state.yaw.toFixed(3),
    state.history.map((m) => MOVE_CHARS[m]).join(''),
    state.helper ? 1 : 0,
  ].join('_');
  document.cookie = `${COOKIE}=${data}; max-age=31536000; SameSite=Lax`;
  // Ersatz, falls Cookies nicht verfügbar sind (z. B. beim Öffnen als lokale Datei)
  try { localStorage.setItem(COOKIE, data); } catch { /* egal */ }
}

function load() {
  let data = document.cookie.split('; ').find((c) => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!data) {
    try { data = localStorage.getItem(COOKIE); } catch { /* egal */ }
  }
  if (!data) return;
  const [cols, moves, pitch, yaw, hist, helper] = data.split('_');
  if (!/^[0-5]{54}$/.test(cols ?? '')) return;
  const colors = [...cols].map(Number);
  const counts = [0, 0, 0, 0, 0, 0];
  colors.forEach((c) => counts[c]++);
  if (counts.some((n) => n !== 9)) return;
  state.colors = colors;
  state.moves = Math.max(0, parseInt(moves, 10) || 0);
  if (isFinite(+pitch) && isFinite(+yaw)) {
    state.pitch = clampPitch(+pitch);
    state.yaw = +yaw;
  }
  state.history = [...(hist ?? '')].map((ch) => MOVE_CHARS.indexOf(ch)).filter((m) => m >= 0);
  state.helper = helper === '1';
}

function clampPitch(p) {
  return Math.max(-1.45, Math.min(1.45, p));
}

// --- Szene --------------------------------------------------------------------

const canvas = $('canvas');
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
scene.add(new THREE.AmbientLight(0xffffff, 2.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(3, 6, 8);
scene.add(sun);

const cubeGroup = new THREE.Group();
scene.add(cubeGroup);

const COLORS = [0xf2f2f2, 0xffd21f, 0xd0282e, 0xff7b1c, 0x18a558, 0x1f62d8]; // U D R L F B
const COLOR_NAMES = ['Weiß', 'Gelb', 'Rot', 'Orange', 'Grün', 'Blau'];

function roundedSquare(size, radius) {
  const h = size / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + radius, -h);
  s.lineTo(h - radius, -h);
  s.quadraticCurveTo(h, -h, h, -h + radius);
  s.lineTo(h, h - radius);
  s.quadraticCurveTo(h, h, h - radius, h);
  s.lineTo(-h + radius, h);
  s.quadraticCurveTo(-h, h, -h, h - radius);
  s.lineTo(-h, -h + radius);
  s.quadraticCurveTo(-h, -h, -h + radius, -h);
  return new THREE.ShapeGeometry(s, 4);
}

const cubies = [];        // { group, grid:[x,y,z] }
const bodies = [];        // Meshes fürs Raycasting
const stickerMats = [];   // Material je Sticker-Index
{
  const bodyGeo = new THREE.BoxGeometry(0.995, 0.995, 0.995);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0b0c0f, roughness: 0.6 });
  const stickerGeo = roundedSquare(0.86, 0.13);
  const byGrid = new Map();
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue;
        const group = new THREE.Group();
        group.position.set(x, y, z);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.userData.grid = [x, y, z];
        group.add(body);
        bodies.push(body);
        cubeGroup.add(group);
        const cubie = { group, grid: [x, y, z] };
        cubies.push(cubie);
        byGrid.set(`${x},${y},${z}`, cubie);
      }
  const zAxis = new THREE.Vector3(0, 0, 1);
  STICKERS.forEach((s, i) => {
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.38 });
    const mesh = new THREE.Mesh(stickerGeo, mat);
    const n = new THREE.Vector3(...s.n);
    mesh.position.copy(n).multiplyScalar(0.502);
    mesh.quaternion.setFromUnitVectors(zAxis, n);
    byGrid.get(s.pos.join(',')).group.add(mesh);
    stickerMats[i] = mat;
  });
}

function paint() {
  for (let i = 0; i < 54; i++) stickerMats[i].color.setHex(COLORS[state.colors[i]]);
  dirty = true;
}

// Hinweis-Pfeil: zwei Bögen mit Spitzen, rotieren in Drehrichtung
const arrow = new THREE.Group();
const arrowSpin = new THREE.Group();
arrow.add(arrowSpin);
arrow.visible = false;
cubeGroup.add(arrow);
{
  const mat = new THREE.MeshBasicMaterial({ color: 0x4cc9f0 });
  const R = 2.42, ARC = Math.PI * 0.72;
  const arcGeo = new THREE.TorusGeometry(R, 0.05, 8, 48, ARC);
  const coneGeo = new THREE.ConeGeometry(0.16, 0.42, 16);
  for (const offset of [0, Math.PI]) {
    const part = new THREE.Group();
    part.rotation.z = offset;
    part.add(new THREE.Mesh(arcGeo, mat));
    const cone = new THREE.Mesh(coneGeo, mat);
    cone.position.set(R * Math.cos(ARC), R * Math.sin(ARC), 0);
    cone.rotation.z = ARC;
    part.add(cone);
    arrowSpin.add(part);
  }
}

function showArrow(move) {
  if (move == null) {
    arrow.visible = false;
  } else {
    const { axis, layer, k } = moveParts(move);
    const dir = new THREE.Vector3();
    dir.setComponent(axis, k === 3 ? -1 : 1);
    arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    arrow.position.set(0, 0, 0).setComponent(axis, layer);
    arrow.visible = true;
  }
  dirty = true;
}

// --- Ansicht ------------------------------------------------------------------

let dirty = true;

function applyView() {
  cubeGroup.rotation.set(state.pitch, state.yaw, 0, 'XYZ');
  dirty = true;
}

function fitCamera() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
  const half = Math.min(halfV, Math.atan(Math.tan(halfV) * camera.aspect));
  camera.position.set(0, 0, (2.75 / Math.sin(half)) * zoom);
  camera.updateProjectionMatrix();
  dirty = true;
}
new ResizeObserver(fitCamera).observe(stage);

// --- Ebenen-Animation ---------------------------------------------------------

const AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];

function setLayerAngle(axis, layer, angle) {
  for (const c of cubies) {
    if (c.grid[axis] !== layer) continue;
    c.group.position.set(...c.grid).applyAxisAngle(AXES[axis], angle);
    c.group.quaternion.setFromAxisAngle(AXES[axis], angle);
  }
  dirty = true;
}

let anim = null;   // { axis, layer, from, to, t0, dur, done }
const queue = [];  // { move, dur, silent, undo, then }

const busy = () => !!anim || queue.length > 0 || drag?.mode === 'turn';

function enqueue(move, opts = {}) {
  queue.push({ move, dur: 190, ...opts });
  pump();
}

function pump() {
  if (anim || !queue.length) return;
  const item = queue.shift();
  const { axis, layer, k } = moveParts(item.move);
  anim = {
    axis, layer,
    from: 0,
    to: k === 3 ? -HALF_PI : k * HALF_PI,
    dur: item.dur * (k === 2 ? 1.5 : 1),
    done: () => {
      commit(item.move, item);
      item.then?.();
    },
  };
}

function commit(move, { silent = false, undo = false } = {}) {
  state.colors = applyMove(state.colors, move);
  paint();
  if (silent) return;
  if (undo) {
    state.moves = Math.max(0, state.moves - 1);
  } else {
    state.moves++;
    state.history.push(move);
    if (state.history.length > HISTORY_MAX) state.history.shift();
  }
  $('tip').classList.add('hide');
  updatePlan(move);
  save();
  updateUI();
  if (isSolved(state.colors)) {
    autoplay = false;
    if (!undo) toast(`Gelöst in ${state.moves} Zügen!`);
    updateUI();
  } else if (autoplay && plan?.length) {
    enqueue(plan[0].move, { dur: 230 });
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  if (anim) {
    anim.t0 ??= now;
    const t = Math.min(1, (now - anim.t0) / anim.dur);
    const e = t * t * (3 - 2 * t);
    setLayerAngle(anim.axis, anim.layer, anim.from + (anim.to - anim.from) * e);
    if (t >= 1) {
      const a = anim;
      setLayerAngle(a.axis, a.layer, 0);
      anim = null;
      a.done();
      pump();
    }
  }
  if (arrow.visible) {
    arrowSpin.rotation.z = (now / 1000) * 1.3;
    dirty = true;
  }
  if (dirty) {
    dirty = false;
    renderer.render(scene, camera);
  }
}

// --- Gesten: Maus / Touch -----------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointers = new Map();
let drag = null;

function localXY(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height };
}

function pick(x, y, w, h) {
  cubeGroup.updateMatrixWorld(true);
  raycaster.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, 1 - (y / h) * 2), camera);
  const hit = raycaster.intersectObjects(bodies, false)[0];
  if (!hit) return null;
  const n = hit.face.normal;
  const nAxis = Math.abs(n.x) > 0.5 ? 0 : Math.abs(n.y) > 0.5 ? 1 : 2;
  return {
    grid: hit.object.userData.grid,
    nAxis,
    nSign: Math.sign(n.getComponent(nAxis)),
    point: cubeGroup.worldToLocal(hit.point.clone()),
  };
}

function toScreen(v, w, h) {
  const p = cubeGroup.localToWorld(v.clone()).project(camera);
  return new THREE.Vector2(((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h);
}

// Wählt aus der Ziehrichtung die Drehachse und liefert die Umrechnung px -> Winkel.
function beginTurn(d, dx, dy, w, h) {
  const normal = new THREE.Vector3().setComponent(d.nAxis, d.nSign);
  const origin = toScreen(d.point, w, h);
  const move = new THREE.Vector2(dx, dy);
  let best = null;
  for (let axis = 0; axis < 3; axis++) {
    if (axis === d.nAxis) continue;
    // Bewegungsrichtung der Fläche bei positiver Drehung um diese Achse
    const tangent = new THREE.Vector3().crossVectors(AXES[axis], normal);
    const s = toScreen(d.point.clone().add(tangent), w, h).sub(origin);
    const len = s.length() || 1;
    const score = Math.abs(move.dot(s)) / len;
    if (!best || score > best.score) best = { axis, score, dir: s.divideScalar(len), pxPerRad: len * 1.15 };
  }
  d.mode = 'turn';
  d.axis = best.axis;
  d.layer = d.grid[best.axis];
  d.dir = best.dir;
  d.pxPerRad = best.pxPerRad;
  d.angle = 0;
}

function endTurn(d, cancel = false) {
  let k = cancel ? 0 : Math.round(d.angle / HALF_PI);
  if (!cancel && k === 0 && Math.abs(d.angle) > 0.3) k = Math.sign(d.angle);
  const to = k * HALF_PI;
  anim = {
    axis: d.axis, layer: d.layer,
    from: d.angle, to,
    dur: Math.max(70, (Math.abs(to - d.angle) / HALF_PI) * 220),
    done: () => {
      const kk = ((k % 4) + 4) % 4;
      if (kk) {
        autoplay = false;
        commit(moveId(d.axis, d.layer, kk));
      }
    },
  };
}

function orbit(dx, dy) {
  state.yaw += dx * 0.008;
  state.pitch = clampPitch(state.pitch + dy * 0.008);
  applyView();
}

function setZoom(z) {
  zoom = Math.max(0.7, Math.min(1.8, z));
  fitCamera();
}

function twoFinger() {
  const [a, b] = [...pointers.values()];
  return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
}

canvas.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  canvas.setPointerCapture(ev.pointerId);
  const p = localXY(ev);
  pointers.set(ev.pointerId, p);
  if (pointers.size === 2) {
    if (drag?.mode === 'turn') endTurn(drag, true);
    drag = { mode: 'multi', ...twoFinger() };
  } else if (pointers.size === 1) {
    const hit = !busy() && pick(p.x, p.y, p.w, p.h);
    drag = hit
      ? { mode: 'pending', id: ev.pointerId, x0: p.x, y0: p.y, ...hit }
      : { mode: 'orbit', id: ev.pointerId, x: p.x, y: p.y };
    canvas.classList.add('grabbing');
  }
});

canvas.addEventListener('pointermove', (ev) => {
  if (!pointers.has(ev.pointerId) || !drag) return;
  const p = localXY(ev);
  pointers.set(ev.pointerId, p);
  if (drag.mode === 'multi') {
    if (pointers.size < 2) return;
    const t = twoFinger();
    orbit(t.cx - drag.cx, t.cy - drag.cy);
    if (drag.dist > 10 && t.dist > 10) setZoom(zoom * (drag.dist / t.dist));
    Object.assign(drag, t);
    return;
  }
  if (drag.id !== ev.pointerId) return;
  if (drag.mode === 'orbit') {
    orbit(p.x - drag.x, p.y - drag.y);
    drag.x = p.x;
    drag.y = p.y;
    return;
  }
  const dx = p.x - drag.x0, dy = p.y - drag.y0;
  if (drag.mode === 'pending') {
    if (Math.hypot(dx, dy) < 8) return;
    if (busy()) { drag = null; return; }
    beginTurn(drag, dx, dy, p.w, p.h);
  }
  const along = dx * drag.dir.x + dy * drag.dir.y;
  drag.angle = Math.max(-Math.PI, Math.min(Math.PI, along / drag.pxPerRad));
  setLayerAngle(drag.axis, drag.layer, drag.angle);
});

function pointerEnd(ev) {
  if (!pointers.delete(ev.pointerId)) return;
  if (!drag) return;
  if (drag.mode === 'multi') {
    if (pointers.size === 0) { drag = null; save(); }
    return;
  }
  if (drag.id !== ev.pointerId) return;
  const d = drag;
  drag = null;
  canvas.classList.remove('grabbing');
  if (d.mode === 'turn') endTurn(d, ev.type === 'pointercancel');
  else if (d.mode === 'orbit') save();
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  setZoom(zoom * Math.exp(ev.deltaY * 0.001));
}, { passive: false });

window.addEventListener('keydown', (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || $('resetDialog').open) return;
  const face = ev.key.toUpperCase();
  if (face.length !== 1 || !'UDLRFB'.includes(face) || busy()) return;
  autoplay = false;
  enqueue(parseMove(face + (ev.shiftKey ? "'" : '')));
});

// --- Helfer -------------------------------------------------------------------

const STAGE_INFO = [
  ['Kreuz unten', (d) => `Bringe die vier ${d}-Kanten nach unten – jede passend zur Farbe ihrer Seitenmitte.`],
  ['Untere Ecken', (d) => `Setze die vier Ecken mit ${d} in die untere Schicht ein.`],
  ['Mittlere Schicht', () => 'Sortiere die vier Kanten der mittleren Schicht von oben ein.'],
  ['Kreuz oben', (d, u) => `Drehe die oberen Kanten, bis oben ein ${u}-Kreuz entsteht.`],
  ['Obere Fläche', (d, u) => `Richte die oberen Ecken aus, bis die ganze Oberseite ${u} ist.`],
  ['Obere Ecken', () => 'Tausche die oberen Ecken an ihre richtigen Plätze.'],
  ['Obere Kanten', () => 'Tausche zum Schluss die oberen Kanten an ihre Plätze.'],
];

function updatePlan(lastMove) {
  if (!state.helper) { plan = null; return; }
  if (plan?.length && lastMove === plan[0].move) plan.shift();
  else plan = solve(state.colors);
}

function renderHelper() {
  const panel = $('helper');
  panel.hidden = !state.helper;
  $('btnHelp').setAttribute('aria-pressed', String(state.helper));
  if (!state.helper) { showArrow(null); return; }

  const solved = !plan?.length;
  const stageNo = solved ? STAGE_COUNT : plan[0].stage;
  $('hDots').innerHTML = STAGE_INFO.map((_, i) =>
    `<i class="${i < stageNo ? 'done' : i === stageNo ? 'now' : ''}"></i>`).join('');
  $('btnStep').disabled = solved;
  $('btnAuto').disabled = solved;
  $('btnAuto').textContent = autoplay ? 'Stopp' : 'Automatisch lösen';

  if (solved) {
    $('hStep').textContent = 'Fertig';
    $('hTitle').textContent = 'Der Würfel ist gelöst';
    $('hText').textContent = 'Tippe auf „Mischen“, um eine neue Runde zu starten.';
    $('hMoves').innerHTML = '';
    showArrow(null);
    return;
  }
  const [title, text] = STAGE_INFO[stageNo];
  const down = COLOR_NAMES[state.colors[CENTERS[1]]];
  const up = COLOR_NAMES[state.colors[CENTERS[0]]];
  $('hStep').textContent = `Schritt ${stageNo + 1}/${STAGE_COUNT} · noch ${plan.length} Züge`;
  $('hTitle').textContent = title;
  $('hText').textContent = `${text(down, up)} Drehe die markierte Ebene in Pfeilrichtung.`;
  const stageMoves = plan.filter((s) => s.stage === stageNo);
  $('hMoves').innerHTML = stageMoves.slice(0, 10).map((s, i) =>
    `<span class="${i ? '' : 'next'}">${moveName(s.move)}</span>`).join('') +
    (stageMoves.length > 10 ? '<span class="more">…</span>' : '');
  showArrow(plan[0].move);
}

// --- Bedienung ----------------------------------------------------------------

function updateUI() {
  $('moveCount').textContent = state.moves;
  $('btnUndo').disabled = !state.history.length;
  renderHelper();
}

let toastTimer;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

function stopAnimations() {
  queue.length = 0;
  if (anim) {
    setLayerAngle(anim.axis, anim.layer, 0);
    anim = null;
  }
  drag = null;
  autoplay = false;
}

$('btnScramble').addEventListener('click', () => {
  if (busy()) return;
  autoplay = false;
  showArrow(null);
  const seq = randomScramble(25);
  seq.forEach((move, i) => enqueue(move, {
    dur: 75,
    silent: true,
    then: i < seq.length - 1 ? null : () => {
      state.moves = 0;
      state.history = [];
      plan = null;
      updatePlan();
      save();
      updateUI();
    },
  }));
});

$('btnUndo').addEventListener('click', () => {
  if (busy() || !state.history.length) return;
  autoplay = false;
  enqueue(inverseMove(state.history.pop()), { undo: true, dur: 150 });
});

$('btnHelp').addEventListener('click', () => {
  state.helper = !state.helper;
  autoplay = false;
  plan = null;
  updatePlan();
  save();
  updateUI();
});

$('btnStep').addEventListener('click', () => {
  if (busy() || !plan?.length) return;
  autoplay = false;
  enqueue(plan[0].move);
});

$('btnAuto').addEventListener('click', () => {
  autoplay = !autoplay;
  if (autoplay && !busy() && plan?.length) enqueue(plan[0].move, { dur: 230 });
  updateUI();
});

$('btnReset').addEventListener('click', () => $('resetDialog').showModal());
$('resetDialog').addEventListener('close', () => {
  if ($('resetDialog').returnValue !== 'ok') return;
  stopAnimations();
  Object.assign(state, { colors: solvedColors(), moves: 0, history: [], ...DEFAULT_VIEW });
  zoom = 1;
  plan = null;
  updatePlan();
  applyView();
  fitCamera();
  paint();
  save();
  updateUI();
  $('toast').hidden = true;
});

// --- Start --------------------------------------------------------------------

load();
applyView();
fitCamera();
paint();
updatePlan();
updateUI();
requestAnimationFrame(frame);

// Für automatisierte Tests
window.__cube = { state, busy, enqueue };
