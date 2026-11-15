// Schicht-für-Schicht-Löser (Anfängermethode) als Grundlage für den Helfer.
// Jede Stufe ist eine Breitensuche über wenige "Makros" (bekannte Zugfolgen),
// die bereits Gelöstes erhalten. Verfolgt wird je Stein nur ein Sticker.

import {
  STICKERS, NORMALS, CENTERS, DEST, stickerAt, parseAlg, moveParts, moveId,
} from './cube.js';

export const STAGE_COUNT = 7;

// --- Makros -----------------------------------------------------------------

const Y_ROT = { F: 'R', R: 'B', B: 'L', L: 'F', U: 'U', D: 'D' };
function rotateAlg(alg, times) {
  let out = alg;
  for (let t = 0; t < times; t++) out = out.replace(/[FRBLUD]/g, (c) => Y_ROT[c]);
  return out;
}

function macro(alg) {
  const moves = parseAlg(alg);
  const dest = new Uint8Array(54);
  for (let i = 0; i < 54; i++) {
    let p = i;
    for (const m of moves) p = DEST[m][p];
    dest[i] = p;
  }
  return { moves, dest };
}

function macroSet(algs, { rotations = true, uTurns = true } = {}) {
  const out = [];
  if (uTurns) for (const a of ['U', 'U2', "U'"]) out.push(macro(a));
  for (const a of algs) {
    for (let t = 0; t < (rotations ? 4 : 1); t++) out.push(macro(rotateAlg(a, t)));
  }
  return out;
}

const ALL_FACE_TURNS = [];
for (const f of 'UDRLFB') for (const s of ['', '2', "'"]) ALL_FACE_TURNS.push(f + s);

const MACROS = [
  macroSet(ALL_FACE_TURNS, { rotations: false, uTurns: false }),
  macroSet(["R U R'", "R U' R'", "R U2 R'", "F' U' F", "F' U F", "F' U2 F"]),
  macroSet(["U R U' R' U' F' U F", "U' F' U F U R U' R'"]),
  macroSet(["F R U R' U' F'", "F U R U' R' F'"]),
  macroSet(["R U R' U R U2 R'", "R U2 R' U' R U' R'"]),
  macroSet(["R' F R' B2 R F' R' B2 R2", "R2 B2 R F R' B2 R F' R"]),
  macroSet(["R U' R U R U R U' R' U' R2", "R2 U R U R' U' R' U' R' U R'"], { uTurns: false }),
];

// --- Verfolgte Sticker je Stufe ---------------------------------------------

const U = NORMALS[0], D = NORMALS[1];
const SIDES = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]]; // F, R, B, L
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

const D_EDGES = SIDES.map((s) => stickerAt(add(D, s), D));
const D_CORNERS = SIDES.map((s, i) => stickerAt(add(add(D, s), SIDES[(i + 1) % 4]), D));
const MID_EDGES = SIDES.map((s, i) => stickerAt(add(s, SIDES[(i + 1) % 4]), s));
const U_EDGES = SIDES.map((s) => stickerAt(add(U, s), U));
const U_CORNERS = SIDES.map((s, i) => stickerAt(add(add(U, s), SIDES[(i + 1) % 4]), U));

const allHome = (ids) => (locs) => locs.every((l, i) => l === ids[i]);
const allOnTop = () => (locs) => locs.every((l) => STICKERS[l].face === 0);

// Ziel "ein Stein mehr gelöst als bisher, ohne Gelöstes zu verlieren"
function oneMore(ids, start) {
  const done = start.map((l, i) => l === ids[i]);
  return (locs) => {
    let more = false;
    for (let i = 0; i < 4; i++) {
      const ok = locs[i] === ids[i];
      if (done[i] && !ok) return false;
      if (!done[i] && ok) more = true;
    }
    return more;
  };
}

const STAGES = [
  { ids: D_EDGES, goal: allHome },
  { ids: D_CORNERS, goal: allHome, stepwise: true },
  { ids: MID_EDGES, goal: allHome, stepwise: true },
  { ids: U_EDGES, goal: allOnTop },
  { ids: U_CORNERS, goal: allOnTop },
  { ids: U_CORNERS, goal: allHome },
  { ids: U_EDGES, goal: allHome },
];

// --- Breitensuche -------------------------------------------------------------

const enc = (l) => ((l[0] * 54 + l[1]) * 54 + l[2]) * 54 + l[3];
function dec(key) {
  const d = key % 54; key = (key - d) / 54;
  const c = key % 54; key = (key - c) / 54;
  const b = key % 54;
  return [(key - b) / 54, b, c, d];
}

function bfs(start, macros, isGoal) {
  if (isGoal(start)) return [];
  const startKey = enc(start);
  const seen = new Map([[startKey, -1]]); // key -> parentKey*64 + macroIndex
  let frontier = [startKey];
  while (frontier.length) {
    const next = [];
    for (const key of frontier) {
      const locs = dec(key);
      for (let m = 0; m < macros.length; m++) {
        const dest = macros[m].dest;
        const nl = [dest[locs[0]], dest[locs[1]], dest[locs[2]], dest[locs[3]]];
        const nk = enc(nl);
        if (seen.has(nk)) continue;
        seen.set(nk, key * 64 + m);
        if (isGoal(nl)) {
          const path = [];
          let k = nk;
          while (k !== startKey) {
            const v = seen.get(k);
            path.push(v % 64);
            k = (v - (v % 64)) / 64;
          }
          return path.reverse().flatMap((i) => macros[i].moves);
        }
        next.push(nk);
      }
    }
    frontier = next;
  }
  return null;
}

// --- Farben -> Steinpositionen ----------------------------------------------

// loc[id] = aktuelle Position des Stickers, der gelöst an Position id gehört.
function locate(colors) {
  const faceOfColor = [];
  CENTERS.forEach((c, f) => { faceOfColor[colors[c]] = f; });
  const loc = new Uint8Array(54);
  for (let i = 0; i < 54; i++) {
    const { pos } = STICKERS[i];
    // Heimatstein: Summe der Normalen aller Farben dieses Steins
    let home = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      if (pos[a] === 0) continue;
      const n = [0, 0, 0];
      n[a] = pos[a];
      home = add(home, NORMALS[faceOfColor[colors[stickerAt(pos, n)]]]);
    }
    loc[stickerAt(home, NORMALS[faceOfColor[colors[i]]])] = i;
  }
  return loc;
}

// --- Lösen --------------------------------------------------------------------

function simplify(steps) {
  const out = [];
  for (const step of steps) {
    const cur = moveParts(step.move);
    const prev = out.length ? moveParts(out[out.length - 1].move) : null;
    if (prev && prev.axis === cur.axis && prev.layer === cur.layer) {
      const k = (prev.k + cur.k) % 4;
      if (k === 0) out.pop();
      else out[out.length - 1] = { move: moveId(cur.axis, cur.layer, k), stage: out[out.length - 1].stage };
    } else {
      out.push(step);
    }
  }
  return out;
}

// Liefert [{ move, stage }] oder null, falls der Zustand unlösbar ist.
export function solve(colors) {
  let loc = locate(colors);
  const steps = [];
  for (let s = 0; s < STAGES.length; s++) {
    const { ids, goal, stepwise } = STAGES[s];
    const done = goal(ids);
    for (let guard = 0; guard < 5; guard++) {
      const start = ids.map((id) => loc[id]);
      if (done(start)) break;
      const moves = bfs(start, MACROS[s], stepwise ? oneMore(ids, start) : done);
      if (!moves) return null;
      for (const m of moves) {
        loc = loc.map((l) => DEST[m][l]);
        steps.push({ move: m, stage: s });
      }
    }
  }
  for (let i = 0; i < 54; i++) if (loc[i] !== i) return null;
  return simplify(steps);
}
