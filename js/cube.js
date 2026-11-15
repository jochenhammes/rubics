// Würfelmodell: 54 Sticker, Züge als Permutationen.
// Achsen: 0=x (rechts), 1=y (oben), 2=z (vorne). Ebenen: -1, 0, 1.
// Ein Zug dreht eine Ebene um k*90° um die positive Achse (Rechte-Hand-Regel).

export const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
export const NORMALS = [
  [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
];

// Sticker: { pos:[x,y,z] des Steins, n: Normale, face: Flächenindex }
export const STICKERS = [];
const stickerIndex = new Map();
const keyOf = (pos, n) => pos.join(',') + '|' + n.join(',');

for (let f = 0; f < 6; f++) {
  const n = NORMALS[f];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (x * n[0] + y * n[1] + z * n[2] !== 1) continue;
        stickerIndex.set(keyOf([x, y, z], n), STICKERS.length);
        STICKERS.push({ pos: [x, y, z], n, face: f });
      }
}

export function stickerAt(pos, n) {
  return stickerIndex.get(keyOf(pos, n));
}

export const CENTERS = NORMALS.map((n) => stickerAt(n, n));

function rot1(v, axis) {
  const [x, y, z] = v;
  if (axis === 0) return [x, -z, y];
  if (axis === 1) return [z, y, -x];
  return [-y, x, z];
}

// Zug-ID: axis*9 + (layer+1)*3 + (k-1), k = 1..3
export const moveId = (axis, layer, k) => axis * 9 + (layer + 1) * 3 + (k - 1);
export const moveParts = (id) => ({
  axis: Math.floor(id / 9),
  layer: (Math.floor(id / 3) % 3) - 1,
  k: (id % 3) + 1,
});
export function inverseMove(id) {
  const { axis, layer, k } = moveParts(id);
  return moveId(axis, layer, 4 - k);
}

// DEST[id][i] = Zielposition des Stickers, der an Position i liegt.
export const DEST = [];
for (let id = 0; id < 27; id++) {
  const { axis, layer, k } = moveParts(id);
  const dest = new Uint8Array(54);
  for (let i = 0; i < 54; i++) {
    let { pos, n } = STICKERS[i];
    if (pos[axis] === layer) {
      for (let t = 0; t < k; t++) {
        pos = rot1(pos, axis);
        n = rot1(n, axis);
      }
    }
    dest[i] = stickerAt(pos, n);
  }
  DEST.push(dest);
}

export function solvedColors() {
  return STICKERS.map((s) => s.face);
}

export function applyMove(colors, id) {
  const dest = DEST[id];
  const out = new Array(54);
  for (let i = 0; i < 54; i++) out[dest[i]] = colors[i];
  return out;
}

export function isSolved(colors) {
  for (let i = 0; i < 54; i++) {
    if (colors[i] !== colors[CENTERS[STICKERS[i].face]]) return false;
  }
  return true;
}

// Notation: Flächenzüge im Uhrzeigersinn (von außen gesehen).
const FACE_MOVES = {
  R: [0, 1, 3], L: [0, -1, 1], U: [1, 1, 3], D: [1, -1, 1], F: [2, 1, 3], B: [2, -1, 1],
  M: [0, 0, 1], E: [1, 0, 1], S: [2, 0, 3],
};

export function parseMove(str) {
  const [axis, layer, k] = FACE_MOVES[str[0]];
  const suffix = str.slice(1);
  const turns = suffix === "'" ? 3 : suffix === '2' ? 2 : 1;
  return moveId(axis, layer, ((k * turns - 1) % 4) + 1);
}

export function parseAlg(str) {
  return str.trim().split(/\s+/).map(parseMove);
}

const NAME_BY_ID = [];
for (const letter of Object.keys(FACE_MOVES)) {
  for (const suffix of ['', '2', "'"]) {
    NAME_BY_ID[parseMove(letter + suffix)] = letter + suffix;
  }
}
export const moveName = (id) => NAME_BY_ID[id];

export function randomScramble(length = 25) {
  const out = [];
  let lastAxis = -1;
  while (out.length < length) {
    const axis = Math.floor(Math.random() * 3);
    if (axis === lastAxis) continue;
    lastAxis = axis;
    const layer = Math.random() < 0.5 ? -1 : 1;
    out.push(moveId(axis, layer, 1 + Math.floor(Math.random() * 3)));
  }
  return out;
}
