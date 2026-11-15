import * as THREE from '../vendor/three.module.min.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 1, 90);

// --- Spieltisch-Szene: Filz, Holzrand, Lampe -------------------------------

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
scene.background = new THREE.Color(0x050403);

const LAMP_POS = new THREE.Vector3(4.5, 13, 6.5);

// Umgebung für Spiegelungen: dunkler Raum, grüner Filz unten, die Lampe als
// helle Scheibe und ein schwaches Fenster hinter der Kamera.
{
  const env = new THREE.Scene();
  const glow = (geo, r, g, b) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color: new THREE.Color(r, g, b), side: THREE.DoubleSide,
  }));
  env.add(glow(new THREE.BoxGeometry(60, 60, 60), 0.05, 0.04, 0.035));
  const ground = glow(new THREE.PlaneGeometry(60, 60), 0.03, 0.16, 0.08);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.5;
  env.add(ground);
  const bulb = glow(new THREE.CircleGeometry(2.2, 32), 8, 6.6, 4.8);
  bulb.position.copy(LAMP_POS);
  bulb.lookAt(0, 0, 0);
  env.add(bulb);
  const windowGlow = glow(new THREE.PlaneGeometry(16, 7), 0.9, 1.0, 1.2);
  windowGlow.position.set(-6, 7, 24);
  windowGlow.lookAt(0, 0, 0);
  env.add(windowGlow);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.03, 0.1, 100).texture;
  pmrem.dispose();
}

// Hängelampe über dem Tisch: warmer Lichtkegel, der zum Rand hin abfällt
const lamp = new THREE.SpotLight(0xfff0d8, 620, 0, 0.62, 0.85, 2);
lamp.position.copy(LAMP_POS);
lamp.target.position.set(0, 0, -1);
lamp.castShadow = true;
lamp.shadow.mapSize.set(1024, 1024);
lamp.shadow.radius = 4;
lamp.shadow.blurSamples = 8;
lamp.shadow.bias = -0.0004;
lamp.shadow.camera.near = 4;
lamp.shadow.camera.far = 40;
scene.add(lamp, lamp.target);
// schwaches Raumlicht: warm von oben, grünlich vom Filz zurückgeworfen
scene.add(new THREE.HemisphereLight(0xfff1e0, 0x1d4a2c, 1.0));

function canvasTexture(w, h, draw, repeatX, repeatY, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Filz: feines Rauschen plus kurze Fasern, als Farb- und Höhenkarte
function drawFelt(base) {
  return (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const n = (Math.random() - 0.5) * 46;
      img.data[i * 4] = base[0] + n;
      img.data[i * 4 + 1] = base[1] + n;
      img.data[i * 4 + 2] = base[2] + n;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI * 2;
      const len = 3 + Math.random() * 7;
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.14)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
  };
}

function drawWood(g, w, h) {
  g.fillStyle = '#5a3418';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 420; i++) {
    const y = Math.random() * h;
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '25,12,4' : '150,96,52'},${0.05 + Math.random() * 0.18})`;
    g.lineWidth = 0.5 + Math.random() * 2;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(w / 3, y + (Math.random() - 0.5) * 9, (2 * w) / 3, y + (Math.random() - 0.5) * 9, w, y);
    g.stroke();
  }
}

const TABLE = { x: 17, zBack: -14, zFront: 22, rim: 1.7, rimH: 0.55 };
{
  const feltW = TABLE.x * 2, feltD = TABLE.zFront - TABLE.zBack;
  const felt = new THREE.Mesh(
    new THREE.PlaneGeometry(feltW, feltD),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: canvasTexture(512, 512, drawFelt([17, 92, 52]), feltW / 5, feltD / 5),
      bumpMap: canvasTexture(512, 512, drawFelt([128, 128, 128]), feltW / 5, feltD / 5, false),
      bumpScale: 0.6,
      roughness: 1,
      sheen: 1, sheenRoughness: 0.7, sheenColor: new THREE.Color(0x3f9a63),
      envMapIntensity: 0.3,
    }),
  );
  felt.rotation.x = -Math.PI / 2;
  felt.position.z = (TABLE.zFront + TABLE.zBack) / 2;
  felt.receiveShadow = true;
  scene.add(felt);

  const woodMat = new THREE.MeshPhysicalMaterial({
    map: canvasTexture(1024, 128, drawWood, 3, 1),
    roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 1,
  });
  const rim = (w, d, x, z) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, TABLE.rimH * 2, d, 4, 0.22), woodMat);
    m.position.set(x, 0, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };
  const zMid = (TABLE.zFront + TABLE.zBack) / 2;
  rim(feltW + TABLE.rim * 2, TABLE.rim, 0, TABLE.zBack - TABLE.rim / 2);
  rim(feltW + TABLE.rim * 2, TABLE.rim, 0, TABLE.zFront + TABLE.rim / 2);
  const side = new THREE.Mesh(new RoundedBoxGeometry(feltD, TABLE.rimH * 2, TABLE.rim, 4, 0.22), woodMat);
  for (const sx of [-1, 1]) {
    const m = side.clone();
    m.rotation.y = Math.PI / 2;
    m.position.set(sx * (TABLE.x + TABLE.rim / 2), 0, zMid);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
}

// --- Nachbearbeitung: Tiefenunschärfe, Vignette, Tonemapping -----------------

const target = new THREE.WebGLRenderTarget(4, 4, {
  type: THREE.HalfFloatType,
  samples: 4,
  depthTexture: new THREE.DepthTexture(4, 4),
});
const post = {
  scene: new THREE.Scene(),
  camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
  material: new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: target.texture },
      tDepth: { value: target.depthTexture },
      texel: { value: new THREE.Vector2() },
      near: { value: 1 }, far: { value: 90 },
      focus: { value: 12 },      // Abstand der Schärfeebene (Würfelmitte)
      range: { value: 3.2 },     // Bereich um die Schärfeebene, der scharf bleibt
      strength: { value: 20 },   // Unschärfe in Pixeln
      maxBlur: { value: 12 },
      exposure: { value: 1.45 },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      #include <packing>
      uniform sampler2D tColor, tDepth;
      uniform vec2 texel;
      uniform float near, far, focus, range, strength, maxBlur, exposure;
      varying vec2 vUv;
      const int TAPS = 28;
      float coc(vec2 uv) {
        float d = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
        return min(maxBlur, strength * max(0.0, abs(d - focus) - range) / d);
      }
      void main() {
        float c = coc(vUv);
        vec3 sum = texture2D(tColor, vUv).rgb;
        float wsum = 1.0;
        if (c > 0.6) {
          for (int i = 1; i < TAPS; i++) {
            float r = sqrt(float(i) / float(TAPS)) * c;
            float a = float(i) * 2.39996;
            vec2 uv = vUv + vec2(cos(a), sin(a)) * r * texel;
            // scharfe Bildteile dürfen nicht in den unscharfen Hintergrund ausbluten
            float w = clamp(coc(uv) / max(r, 0.6), 0.0, 1.0);
            sum += texture2D(tColor, uv).rgb * w;
            wsum += w;
          }
        }
        vec3 col = sum / wsum;
        vec2 q = vUv - 0.5;
        col *= 1.0 - 0.55 * smoothstep(0.35, 0.95, length(q) * 1.25);
        // Tonemapping über die Helligkeit, damit kräftige Farben im Licht nicht ausbleichen
        col *= exposure;
        float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col *= (1.0 + l / 6.25) / (1.0 + l);
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        #include <colorspace_fragment>
      }`,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }),
};
post.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post.material));

function render() {
  settle();
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(post.scene, post.camera);
}

const cubeGroup = new THREE.Group();
scene.add(cubeGroup);

const COLORS = [0xf4f4f0, 0xffd000, 0xc4121c, 0xff5a00, 0x009b48, 0x0046c8]; // U D R L F B
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
  // leicht erhabene Kachel mit gerundeter Kante, damit sie Glanzlichter fängt
  return new THREE.ExtrudeGeometry(s, {
    depth: 0.008, curveSegments: 6,
    bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 3,
  });
}

const cubies = [];        // { group, grid:[x,y,z] }
const bodies = [];        // Meshes fürs Raycasting
const stickerMats = [];   // Material je Sticker-Index
{
  const bodyGeo = new RoundedBoxGeometry(0.975, 0.975, 0.975, 5, 0.075);
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x08080a, roughness: 0.45, specularIntensity: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3,
    envMapIntensity: 1.6,
  });
  const stickerGeo = roundedSquare(0.79, 0.09);
  const byGrid = new Map();
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue;
        const group = new THREE.Group();
        group.position.set(x, y, z);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.userData.grid = [x, y, z];
        body.castShadow = true;
        group.add(body);
        bodies.push(body);
        cubeGroup.add(group);
        const cubie = { group, grid: [x, y, z] };
        cubies.push(cubie);
        byGrid.set(`${x},${y},${z}`, cubie);
      }
  const zAxis = new THREE.Vector3(0, 0, 1);
  STICKERS.forEach((s, i) => {
    const mat = new THREE.MeshPhysicalMaterial({
      roughness: 0.5, specularIntensity: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.32, envMapIntensity: 1.6,
    });
    const mesh = new THREE.Mesh(stickerGeo, mat);
    const n = new THREE.Vector3(...s.n);
    mesh.position.copy(n).multiplyScalar(0.4875);
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
  const mat = new THREE.MeshBasicMaterial({ color: 0x4cc9f0, toneMapped: false });
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

const CAM_ELEV = 0.5;  // Blick von schräg oben auf den Tisch
const LOOK_Y = 1.7;
const HALF = 0.4875;   // halbe Kantenlänge eines Steins

// Der Würfel wird in der Hand gedreht; Kamera, Tisch und Licht bleiben stehen.
function applyView() {
  cubeGroup.rotation.set(state.pitch - CAM_ELEV, state.yaw, 0, 'XYZ');
  dirty = true;
}

// Setzt den Würfel so auf den Filz, dass sein tiefster Punkt gerade aufliegt –
// auch gekippt und während eine Ebene gedreht wird.
const up = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
function settle() {
  up.set(0, 1, 0).applyQuaternion(tmpQ.copy(cubeGroup.quaternion).invert());
  let low = Infinity;
  for (const c of cubies) {
    tmpV.copy(up).applyQuaternion(tmpQ.copy(c.group.quaternion).invert());
    const reach = HALF * (Math.abs(tmpV.x) + Math.abs(tmpV.y) + Math.abs(tmpV.z));
    low = Math.min(low, up.dot(c.group.position) - reach);
  }
  cubeGroup.position.y = 0.012 - low;
}

function fitCamera() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  target.setSize(size.x, size.y);
  camera.aspect = w / h;
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
  const half = Math.min(halfV, Math.atan(Math.tan(halfV) * camera.aspect));
  const dist = (3.0 / Math.sin(half)) * zoom;
  camera.position.set(0, LOOK_Y + dist * Math.sin(CAM_ELEV), dist * Math.cos(CAM_ELEV));
  camera.lookAt(0, LOOK_Y, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const u = post.material.uniforms;
  u.texel.value.set(1 / size.x, 1 / size.y);
  u.focus.value = dist;
  u.strength.value = size.y * 0.03;
  u.maxBlur.value = size.y * 0.013;
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
    render();
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
  settle();
  cubeGroup.updateMatrixWorld(true);
  raycaster.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, 1 - (y / h) * 2), camera);
  const hit = raycaster.intersectObjects(bodies, false)[0];
  if (!hit) return null;
  const n = hit.face.normal;
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  const nAxis = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
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
