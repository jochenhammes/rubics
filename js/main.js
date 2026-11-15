import * as THREE from '../vendor/three.module.min.js';
import { RoundedBoxGeometry } from '../vendor/RoundedBoxGeometry.js';
import {
  STICKERS, CENTERS, solvedColors, applyMove, isSolved, moveId, moveParts,
  inverseMove, moveName, parseMove, randomScramble,
} from './cube.js';
import { solve, STAGE_COUNT } from './solver.js';
import { createPoker } from './poker.js';

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
  if (POKER) return; // der Pokertisch hat keinen Spielstand
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

// Ressourcenschonende Darstellung per URL-Parameter (?grafik=einfach) oder
// automatisch, wenn der Browser kein WebGL 2 kann.
const query = new URLSearchParams(location.search);
const wantsLite = query.has('lite') ||
  ['einfach', 'lite', 'low', 'niedrig'].includes((query.get('grafik') ?? query.get('quality') ?? '').toLowerCase());
// Poker-Variante (?variante=poker): Pokertisch mit Karten, Chips und Kartengeben statt des Würfels
const POKER = query.has('poker') ||
  (query.get('variante') ?? query.get('variant') ?? '').toLowerCase() === 'poker';
const TABLE_CENTER = new THREE.Vector3(0, 0, -4); // Mitte des Pokertischs
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: wantsLite,
  powerPreference: wantsLite ? 'low-power' : 'high-performance',
});
const LITE = wantsLite || !renderer.capabilities.isWebGL2;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, LITE ? 1.5 : 2));

// Material mit Lack-/Samteffekten; in der einfachen Darstellung ohne diese Extras
const material = (base, extras) => (LITE
  ? new THREE.MeshStandardMaterial(base)
  : new THREE.MeshPhysicalMaterial({ ...base, ...extras }));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 1, 220);

// --- Spieltisch-Szene: Filz, Holzrand, Lampe -------------------------------

renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.VSMShadowMap;
scene.background = new THREE.Color(0x050403);

const LAMP_POS = POKER ? new THREE.Vector3(5.5, 16, 3) : new THREE.Vector3(4.5, 13, 6.5);

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
const lamp = new THREE.SpotLight(0xfff0d8, (LITE ? 430 : 620) * (POKER ? 1.6 : 1), 0, POKER ? 0.8 : 0.62, 0.85, 2);
lamp.position.copy(LAMP_POS);
lamp.target.position.set(0, 0, POKER ? TABLE_CENTER.z : -1);
lamp.castShadow = !LITE;
// Pokertisch: viele kleine Schattenwerfer, daher feiner aufgelöst und schärfer
lamp.shadow.mapSize.set(POKER ? 2048 : 1024, POKER ? 2048 : 1024);
lamp.shadow.radius = POKER ? 2.5 : 4;
lamp.shadow.blurSamples = 8;
lamp.shadow.bias = -0.0006;
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
    material({
      map: canvasTexture(512, 512, drawFelt([17, 92, 52]), feltW / 5, feltD / 5),
      roughness: 1,
    }, {
      bumpMap: canvasTexture(512, 512, drawFelt([128, 128, 128]), feltW / 5, feltD / 5, false),
      bumpScale: 0.6,
      sheen: 1, sheenRoughness: 0.7, sheenColor: new THREE.Color(0x3f9a63),
      envMapIntensity: 0.3,
    }),
  );
  felt.rotation.x = -Math.PI / 2;
  felt.position.z = (TABLE.zFront + TABLE.zBack) / 2;
  felt.receiveShadow = true;
  scene.add(felt);

  // Gebrauchsspuren im Filz: abgewetzte helle Zonen, Flecken, ein Glasrand,
  // Schleifspuren und Fusseln – als großflächige, nicht gekachelte Auflage.
  if (!LITE) {
    const wear = new THREE.Mesh(
      new THREE.PlaneGeometry(feltW, feltD),
      new THREE.MeshStandardMaterial({
        map: canvasTexture(1024, 1024, (g, w, h) => {
          const u = w / feltW, v = h / feltD;           // Pixel je Einheit
          const cx = w / 2, cy = (TABLE_CENTER.z - TABLE.zBack) * v;
          const blob = (x, y, r, color) => {
            const grad = g.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, color);
            grad.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
            g.fillStyle = grad;
            g.fillRect(x - r, y - r, r * 2, r * 2);
          };
          // abgewetzte Mitte, wo Karten und Chips geschoben werden
          g.save();
          g.translate(cx, cy);
          g.scale(1.5, 1);
          blob(0, 0, 9 * v, 'rgba(210,235,190,0.10)');
          g.restore();
          for (let i = 0; i < 16; i++) {
            blob(cx + (Math.random() - 0.5) * 26 * u, cy + (Math.random() - 0.5) * 20 * v,
              (0.6 + Math.random() * 2.2) * u, `rgba(0,10,0,${0.05 + Math.random() * 0.09})`);
          }
          for (let i = 0; i < 10; i++) {
            blob(cx + (Math.random() - 0.5) * 26 * u, cy + (Math.random() - 0.5) * 20 * v,
              (0.5 + Math.random() * 1.6) * u, `rgba(225,240,200,${0.03 + Math.random() * 0.06})`);
          }
          // Schleifspuren von der Mitte zu den Plätzen
          g.lineCap = 'round';
          for (let i = 0; i < 14; i++) {
            const a = Math.random() * Math.PI * 2, r0 = 1 + Math.random() * 3, r1 = 4 + Math.random() * 6;
            g.strokeStyle = `rgba(215,240,200,${0.005 + Math.random() * 0.012})`;
            g.lineWidth = (0.5 + Math.random() * 0.9) * u;
            g.beginPath();
            g.moveTo(cx + Math.cos(a) * r0 * u, cy + Math.sin(a) * r0 * v);
            g.lineTo(cx + Math.cos(a + 0.1) * r1 * 1.3 * u, cy + Math.sin(a + 0.1) * r1 * v);
            g.stroke();
          }
          // Glasränder
          for (const [dx, dz] of [[-10.5, 5.2], [11.8, -6.8]]) {
            g.strokeStyle = 'rgba(0,12,0,0.13)';
            g.lineWidth = 0.09 * u;
            g.beginPath();
            g.ellipse(cx + dx * u, cy + dz * v, 1.15 * u, 1.15 * v, 0, 0.3, Math.PI * 1.85);
            g.stroke();
          }
          // Fusseln und Krümel
          for (let i = 0; i < 900; i++) {
            g.fillStyle = `rgba(235,240,225,${0.08 + Math.random() * 0.3})`;
            g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.6, 1);
          }
        }, 1, 1),
        transparent: true, depthWrite: false, roughness: 1,
      }),
    );
    wear.rotation.x = -Math.PI / 2;
    wear.position.set(0, 0.003, felt.position.z);
    wear.receiveShadow = true;
    wear.renderOrder = 0.5;
    scene.add(wear);
  }

  const woodMat = material(
    { map: canvasTexture(1024, 128, drawWood, 3, 1), roughness: 0.42 },
    { clearcoat: 0.7, clearcoatRoughness: 0.2 },
  );
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

const target = LITE ? null : new THREE.WebGLRenderTarget(4, 4, {
  type: THREE.HalfFloatType,
  samples: 4,
  depthTexture: new THREE.DepthTexture(4, 4),
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
const quadScene = new THREE.Scene().add(quad);
const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const QUAD_VERTEX = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function drawQuad(mat, to) {
  quad.material = mat;
  renderer.setRenderTarget(to);
  renderer.render(quadScene, quadCamera);
}

const post = LITE ? null : {

  material: new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: target.texture },
      tDepth: { value: target.depthTexture },
      texel: { value: new THREE.Vector2() },
      near: { value: 1 }, far: { value: 90 },
      focus: { value: 12 },      // Abstand der Schärfeebene (Würfelmitte)
      range: { value: POKER ? 9 : 3.2 }, // Bereich um die Schärfeebene, der scharf bleibt
      strength: { value: 20 },   // Unschärfe in Pixeln
      maxBlur: { value: 12 },
      exposure: { value: 1.45 },
    },
    vertexShader: QUAD_VERTEX,
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

// --- Kontaktschatten ----------------------------------------------------------
// Eine Kamera unter dem Tisch schaut nach oben und misst, wie nah der Würfel
// dem Filz ist. Weichgezeichnet ergibt das den dunklen Schatten an der
// Auflagefläche, der den Würfel "erdet" – auch gekippt und beim Drehen.

const CONTACT = POKER
  ? { size: 30, height: 1.0, res: 1024, z: TABLE_CENTER.z, opacity: 0.8, spread: 1.1 }
  : { size: 6.6, height: 1.5, res: 256, z: 0, opacity: 0.85, spread: 1.6 };
const contact = LITE ? null : (() => {
  const rt = () => new THREE.WebGLRenderTarget(CONTACT.res, CONTACT.res);
  const cam = new THREE.OrthographicCamera(
    -CONTACT.size / 2, CONTACT.size / 2, CONTACT.size / 2, -CONTACT.size / 2, 0, CONTACT.height,
  );
  cam.rotation.x = Math.PI / 2;
  cam.position.z = CONTACT.z;
  cam.layers.set(1);
  const depthMat = new THREE.MeshDepthMaterial();
  depthMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( vec3( 0.0 ), pow( 1.0 - fragCoordZ, 2.5 ) );',
    );
  };
  const a = rt(), b = rt();
  const blur = new THREE.ShaderMaterial({
    uniforms: { tex: { value: null }, dir: { value: new THREE.Vector2() } },
    vertexShader: QUAD_VERTEX,
    fragmentShader: `
      uniform sampler2D tex;
      uniform vec2 dir;
      varying vec2 vUv;
      void main() {
        vec4 sum = texture2D(tex, vUv) * 0.227;
        sum += (texture2D(tex, vUv + dir * 1.38) + texture2D(tex, vUv - dir * 1.38)) * 0.316;
        sum += (texture2D(tex, vUv + dir * 3.23) + texture2D(tex, vUv - dir * 3.23)) * 0.0703;
        gl_FragColor = sum;
      }`,
    depthTest: false,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(CONTACT.size, CONTACT.size),
    new THREE.MeshBasicMaterial({
      map: a.texture, transparent: true, opacity: CONTACT.opacity, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  plane.rotation.x = Math.PI / 2;
  plane.position.set(0, 0.006, CONTACT.z);
  plane.renderOrder = 1;
  scene.add(plane);
  return { cam, depthMat, a, b, blur };
})();

function renderContact() {
  const background = scene.background;
  scene.background = null;
  scene.overrideMaterial = contact.depthMat;
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(contact.a);
  renderer.render(scene, contact.cam);
  scene.overrideMaterial = null;
  scene.background = background;
  const step = CONTACT.spread / CONTACT.res;
  for (let pass = 0; pass < 2; pass++) {
    contact.blur.uniforms.tex.value = contact.a.texture;
    contact.blur.uniforms.dir.value.set(step, 0);
    drawQuad(contact.blur, contact.b);
    contact.blur.uniforms.tex.value = contact.b.texture;
    contact.blur.uniforms.dir.value.set(0, step);
    drawQuad(contact.blur, contact.a);
  }
  renderer.setClearColor(0x000000, 1);
  renderer.shadowMap.autoUpdate = true;
}

// Einfache Darstellung: fester, weicher Schattenfleck unter dem Würfel statt berechneter Schatten
if (LITE && !POKER) {
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 6.4),
    new THREE.MeshBasicMaterial({
      map: canvasTexture(128, 128, (g, w, h) => {
        const grad = g.createRadialGradient(w / 2, h / 2, w * 0.12, w / 2, h / 2, w / 2);
        grad.addColorStop(0, 'rgba(0,0,0,0.75)');
        grad.addColorStop(0.55, 'rgba(0,0,0,0.4)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      }, 1, 1),
      transparent: true, depthWrite: false,
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.set(-0.5, 0.006, -0.4);
  scene.add(blob);
}

function render() {
  settle();
  if (LITE) {
    renderer.render(scene, camera);
    return;
  }
  renderContact();
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  drawQuad(post.material, null);
}

const cubeGroup = new THREE.Group();
cubeGroup.visible = !POKER;
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

const rnd = (range) => (Math.random() - 0.5) * 2 * range;

// Gebrauchsspuren für die Farbkacheln: abgedunkelte Ränder, feine Kratzer und
// Fingerabdrücke, die den Glanz ungleichmäßig machen. Einige Varianten, die je
// Kachel zufällig gedreht werden.
const WEAR_VARIANTS = LITE ? [] : Array.from({ length: 5 }, () => {
  const scratches = Array.from({ length: 26 }, () => ({
    x: Math.random(), y: Math.random(), a: Math.random() * Math.PI, len: 0.08 + Math.random() * 0.45,
    bend: rnd(0.08), alpha: 0.25 + Math.random() * 0.75,
  }));
  const stroke = (g, w, sc, style, width) => {
    const dx = Math.cos(sc.a) * sc.len * w, dy = Math.sin(sc.a) * sc.len * w;
    g.strokeStyle = style;
    g.lineWidth = width;
    g.beginPath();
    g.moveTo(sc.x * w, sc.y * w);
    g.quadraticCurveTo(sc.x * w + dx / 2 - dy * sc.bend, sc.y * w + dy / 2 + dx * sc.bend, sc.x * w + dx, sc.y * w + dy);
    g.stroke();
  };
  const color = canvasTexture(256, 256, (g, w) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, w);
    // Rand: Schmutz und Abschattung in den Fugen
    for (const [x0, y0, x1, y1] of [[0, 0, 0.16, 0], [1, 0, 0.84, 0], [0, 0, 0, 0.16], [0, 1, 0, 0.84]]) {
      const grad = g.createLinearGradient(x0 * w, y0 * w, x1 * w, y1 * w);
      grad.addColorStop(0, 'rgba(0,0,0,0.3)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, w);
    }
    for (const sc of scratches) stroke(g, w, sc, `rgba(0,0,0,${0.10 * sc.alpha})`, 0.8);
  }, 1, 1);
  const rough = canvasTexture(256, 256, (g, w) => {
    g.fillStyle = 'rgb(150,150,150)';
    g.fillRect(0, 0, w, w);
    // Fingerabdrücke: matte, weiche Flecken
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * w, y = Math.random() * w, r = w * (0.1 + Math.random() * 0.22);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const v = Math.random() < 0.7 ? 255 : 60;
      grad.addColorStop(0, `rgba(${v},${v},${v},${0.25 + Math.random() * 0.3})`);
      grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, w, w);
    }
    for (const sc of scratches) stroke(g, w, sc, `rgba(255,255,255,${0.7 * sc.alpha})`, 1.1);
  }, 1, 1, false);
  return { color, rough };
});

function wearMaps() {
  if (!WEAR_VARIANTS.length) return {};
  const variant = WEAR_VARIANTS[Math.floor(Math.random() * WEAR_VARIANTS.length)];
  const turn = Math.floor(Math.random() * 4) * (Math.PI / 2) + rnd(0.06);
  const place = (tex) => {
    // Kachel-UVs laufen um die Kachelmitte von -0.41 bis 0.41
    const t = tex.clone();
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(1 / 0.82, 1 / 0.82);
    t.offset.set(0.5, 0.5);
    t.rotation = turn;
    t.needsUpdate = true;
    return t;
  };
  const rough = place(variant.rough);
  return { map: place(variant.color), roughnessMap: rough, clearcoatRoughnessMap: rough };
}

const cubies = [];        // { group, inner, grid:[x,y,z] }
const bodies = [];        // Meshes fürs Raycasting
const stickerMats = [];   // Material je Sticker-Index
{
  const bodyGeo = new RoundedBoxGeometry(0.975, 0.975, 0.975, 5, 0.075);
  const bodyMat = material(
    { color: 0x08080a, roughness: 0.45 },
    { specularIntensity: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 1.6 },
  );
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
        body.castShadow = body.receiveShadow = true;
        body.layers.enable(1); // für die Kontaktschatten-Kamera
        // echte Würfel sitzen nie perfekt: minimal versetzen und verdrehen
        const inner = new THREE.Group();
        if (!LITE) {
          inner.position.set(rnd(0.004), rnd(0.004), rnd(0.004));
          inner.rotation.set(rnd(0.009), rnd(0.009), rnd(0.009));
        }
        inner.add(body);
        group.add(inner);
        bodies.push(body);
        cubeGroup.add(group);
        const cubie = { group, inner, grid: [x, y, z] };
        cubies.push(cubie);
        byGrid.set(`${x},${y},${z}`, cubie);
      }
  const zAxis = new THREE.Vector3(0, 0, 1);
  STICKERS.forEach((s, i) => {
    const mat = material({ roughness: LITE ? 0.45 : 0.85 }, {
      specularIntensity: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.55, envMapIntensity: 1.6,
      ...wearMaps(),
    });
    const mesh = new THREE.Mesh(stickerGeo, mat);
    const n = new THREE.Vector3(...s.n);
    mesh.position.copy(n).multiplyScalar(0.4875);
    mesh.quaternion.setFromUnitVectors(zAxis, n);
    mesh.receiveShadow = true;
    byGrid.get(s.pos.join(',')).inner.add(mesh);
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

// Blick von schräg oben auf den Tisch. Am Pokertisch kreist die Kamera um die Tischmitte.
const CAM_ELEV = 0.5;
const LOOK = POKER ? TABLE_CENTER : new THREE.Vector3(0, 1.7, 0);
const pokerView = { yaw: 0, pitch: 0.86 };
const REST_PITCH = 0.5; // bei diesem Ansichtswinkel steht der Würfel flach auf dem Tisch
const CUBE_CENTER = new THREE.Vector3(0, 1.5, 0);
const HALF = 0.4875;   // halbe Kantenlänge eines Steins

// Der Würfel wird in der Hand gedreht; Kamera, Tisch und Licht bleiben stehen.
function applyView() {
  cubeGroup.rotation.set(state.pitch - REST_PITCH, state.yaw, 0, 'XYZ');
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
  target?.setSize(size.x, size.y);
  camera.aspect = w / h;
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
  const half = Math.min(halfV, Math.atan(Math.tan(halfV) * camera.aspect));
  // Bildausschnitt: der Würfel bzw. die Karten rund um die Tischmitte
  const fit = !POKER ? 3.0 : camera.aspect < 1 ? 8.8 : 8.6;
  const dist = (fit / Math.sin(half)) * zoom;
  const yaw = POKER ? pokerView.yaw : 0, pitch = POKER ? pokerView.pitch : CAM_ELEV;
  camera.position.set(
    LOOK.x + dist * Math.sin(yaw) * Math.cos(pitch),
    LOOK.y + dist * Math.sin(pitch),
    LOOK.z + dist * Math.cos(yaw) * Math.cos(pitch),
  );
  camera.lookAt(LOOK);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  if (post) {
    const u = post.material.uniforms;
    u.texel.value.set(1 / size.x, 1 / size.y);
    u.focus.value = camera.position.distanceTo(POKER ? LOOK : CUBE_CENTER);
    u.strength.value = size.y * 0.03;
    u.maxBlur.value = size.y * 0.013;
  }
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
  if (poker?.update(now)) dirty = true;
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
  if (POKER) {
    pokerView.yaw = Math.max(-1.1, Math.min(1.1, pokerView.yaw - dx * 0.006));
    pokerView.pitch = Math.max(0.28, Math.min(1.4, pokerView.pitch + dy * 0.006));
    fitCamera();
    return;
  }
  state.yaw += dx * 0.008;
  state.pitch = clampPitch(state.pitch + dy * 0.008);
  applyView();
}

function setZoom(z) {
  zoom = Math.max(POKER ? 0.3 : 0.7, Math.min(POKER ? 2.2 : 1.8, z));
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
    const hit = !POKER && !busy() && pick(p.x, p.y, p.w, p.h);
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
  if (POKER || ev.ctrlKey || ev.metaKey || ev.altKey || $('resetDialog').open) return;
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

const poker = POKER ? createPoker({ scene, material, canvasTexture, lite: LITE, center: TABLE_CENTER }) : null;
if (poker) {
  document.body.classList.add('poker');
  document.title = 'Pokertisch';
  document.querySelector('h1').textContent = "Texas Hold'em";
  $('tip').textContent = 'Ziehen: Kamera schwenken · Zoomen: Mausrad oder zwei Finger';
  $('btnDeal').hidden = false;
  $('btnDeal').addEventListener('click', () => {
    $('tip').classList.add('hide');
    poker.deal(performance.now());
  });
  setTimeout(() => poker.deal(performance.now()), 700);
} else {
  load();
}
applyView();
fitCamera();
paint();
updatePlan();
updateUI();
requestAnimationFrame(frame);

// Für automatisierte Tests
window.__cube = { state, busy, enqueue };
