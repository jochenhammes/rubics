var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/engine/rng.ts
function seedRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = s + 2654435769 >>> 0;
    let z = s;
    z = Math.imul(z ^ z >>> 16, 2246822507) >>> 0;
    z = Math.imul(z ^ z >>> 13, 3266489909) >>> 0;
    return (z ^ z >>> 16) >>> 0;
  };
  const st = [next(), next(), next(), next()];
  for (let i = 0; i < 12; i++) nextUint32(st);
  return st;
}
function nextUint32(st) {
  let [a, b, c, d] = st;
  const t = (a + b >>> 0) + d >>> 0;
  d = d + 1 >>> 0;
  a = b ^ b >>> 9;
  b = c + (c << 3) >>> 0;
  c = c << 21 | c >>> 11;
  c = c + t >>> 0;
  st[0] = a >>> 0;
  st[1] = b;
  st[2] = c;
  st[3] = d;
  return t;
}
function nextFloat(st) {
  return nextUint32(st) / 4294967296;
}
function nextInt(st, n) {
  return Math.floor(nextFloat(st) * n);
}
function shuffle(arr, st) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(st, i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
function randomSeed() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0];
  }
  return Math.random() * 4294967296 >>> 0;
}

// src/engine/evaluator.ts
var CATEGORY_KEYS = [
  "highCard",
  "pair",
  "twoPair",
  "trips",
  "straight",
  "flush",
  "fullHouse",
  "quads",
  "straightFlush"
];
var POPCOUNT = new Uint8Array(8192);
var STRAIGHT_HIGH = new Int8Array(8192);
(function initTables() {
  for (let m = 0; m < 8192; m++) {
    let c = 0;
    for (let b = 0; b < 13; b++) if (m & 1 << b) c++;
    POPCOUNT[m] = c;
    let high = -1;
    for (let h = 12; h >= 4; h--) {
      const run = 31 << h - 4;
      if ((m & run) === run) {
        high = h;
        break;
      }
    }
    if (high < 0 && (m & 4111) === 4111) high = 3;
    STRAIGHT_HIGH[m] = high;
  }
})();
function topRanks(mask, n) {
  let out = 0;
  let taken = 0;
  for (let r = 12; r >= 0 && taken < n; r--) {
    if (mask & 1 << r) {
      out = out << 4 | r;
      taken++;
    }
  }
  return out << 4 * (n - taken);
}
function evaluate(cards, len = cards.length) {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  for (let i = 0; i < len; i++) {
    const c = cards[i];
    const bit = 1 << (c >> 2);
    switch (c & 3) {
      case 0:
        s0 |= bit;
        break;
      case 1:
        s1 |= bit;
        break;
      case 2:
        s2 |= bit;
        break;
      default:
        s3 |= bit;
    }
  }
  let flushMask = 0;
  if (POPCOUNT[s0] >= 5) flushMask = s0;
  else if (POPCOUNT[s1] >= 5) flushMask = s1;
  else if (POPCOUNT[s2] >= 5) flushMask = s2;
  else if (POPCOUNT[s3] >= 5) flushMask = s3;
  if (flushMask) {
    const sf = STRAIGHT_HIGH[flushMask];
    if (sf >= 0) return 8 << 20 | sf << 16;
    return 5 << 20 | topRanks(flushMask, 5);
  }
  const all = s0 | s1 | s2 | s3;
  let quad = -1;
  let trip1 = -1, trip2 = -1;
  let pair1 = -1, pair2 = -1, pair3 = -1;
  for (let r = 12; r >= 0; r--) {
    const bit = 1 << r;
    if (!(all & bit)) continue;
    const cnt = (s0 & bit ? 1 : 0) + (s1 & bit ? 1 : 0) + (s2 & bit ? 1 : 0) + (s3 & bit ? 1 : 0);
    if (cnt === 4) quad = r;
    else if (cnt === 3) {
      if (trip1 < 0) trip1 = r;
      else if (trip2 < 0) trip2 = r;
    } else if (cnt === 2) {
      if (pair1 < 0) pair1 = r;
      else if (pair2 < 0) pair2 = r;
      else if (pair3 < 0) pair3 = r;
    }
  }
  if (quad >= 0) {
    return 7 << 20 | quad << 16 | topRanks(all & ~(1 << quad), 1) << 12;
  }
  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) {
    const p = trip2 > pair1 ? trip2 : pair1;
    return 6 << 20 | trip1 << 16 | p << 12;
  }
  const st = STRAIGHT_HIGH[all];
  if (st >= 0) return 4 << 20 | st << 16;
  if (trip1 >= 0) {
    return 3 << 20 | trip1 << 16 | topRanks(all & ~(1 << trip1), 2) << 8;
  }
  if (pair2 >= 0) {
    const kick = topRanks(all & ~(1 << pair1) & ~(1 << pair2), 1);
    return 2 << 20 | pair1 << 16 | pair2 << 12 | kick << 8;
  }
  if (pair1 >= 0) {
    return 1 << 20 | pair1 << 16 | topRanks(all & ~(1 << pair1), 3) << 4;
  }
  return topRanks(all, 5);
}
var categoryOf = (score) => score >> 20;
function describeHand(cards) {
  if (cards.length < 5) throw new Error("describeHand needs at least 5 cards");
  let bestScore = -1;
  let best = [];
  const n = cards.length;
  const buf = new Array(5);
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            buf[0] = cards[a];
            buf[1] = cards[b];
            buf[2] = cards[c];
            buf[3] = cards[d];
            buf[4] = cards[e];
            const s = evaluate(buf, 5);
            if (s > bestScore) {
              bestScore = s;
              best = buf.slice();
            }
          }
  const category = categoryOf(bestScore);
  return { score: bestScore, category, key: CATEGORY_KEYS[category], best };
}

// src/ai/equity.ts
function chenScore(a, b) {
  let r1 = a >> 2, r2 = b >> 2;
  if (r2 > r1) [r1, r2] = [r2, r1];
  const base = (r) => r === 12 ? 10 : r === 11 ? 8 : r === 10 ? 7 : r === 9 ? 6 : (r + 2) / 2;
  let score = base(r1);
  if (r1 === r2) return Math.max(5, Math.ceil(score * 2));
  if ((a & 3) === (b & 3)) score += 2;
  const gap = r1 - r2 - 1;
  score -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && r1 < 10) score += 1;
  return Math.ceil(score);
}
var CHEN = new Int8Array(52 * 52);
for (let a = 0; a < 52; a++) for (let b = 0; b < 52; b++) if (a !== b) CHEN[a * 52 + b] = chenScore(a, b);
function monteCarloEquity(req, rng) {
  const { hero, board, opponentMinChen, iterations } = req;
  const nOpp = opponentMinChen.length;
  if (nOpp === 0) return 1;
  const dead = new Uint8Array(52);
  for (const c of hero) dead[c] = 1;
  for (const c of board) dead[c] = 1;
  const live = [];
  for (let c = 0; c < 52; c++) if (!dead[c]) live.push(c);
  const liveN = live.length;
  const used = new Uint32Array(52);
  const heroCards = new Int32Array(7);
  const oppCards = new Int32Array(7);
  const fullBoard = new Int32Array(5);
  const opp = new Int32Array(nOpp * 2);
  for (let i = 0; i < board.length; i++) fullBoard[i] = board[i];
  heroCards[0] = hero[0];
  heroCards[1] = hero[1];
  const need = 5 - board.length;
  let total = 0;
  for (let it = 1; it <= iterations; it++) {
    const stamp = it;
    const draw = () => {
      for (; ; ) {
        const c = live[nextUint32(rng) % liveN];
        if (used[c] !== stamp) {
          used[c] = stamp;
          return c;
        }
      }
    };
    for (let o = 0; o < nOpp; o++) {
      const min = opponentMinChen[o];
      let c1 = draw();
      let c2 = draw();
      for (let tries = 0; tries < 25 && CHEN[c1 * 52 + c2] < min; tries++) {
        used[c1] = 0;
        used[c2] = 0;
        c1 = draw();
        c2 = draw();
      }
      opp[o * 2] = c1;
      opp[o * 2 + 1] = c2;
    }
    for (let i = 0; i < need; i++) fullBoard[board.length + i] = draw();
    for (let i = 0; i < 5; i++) heroCards[2 + i] = oppCards[2 + i] = fullBoard[i];
    const heroScore = evaluate(heroCards, 7);
    let best = 0;
    let ties = 0;
    let lost = false;
    for (let o = 0; o < nOpp; o++) {
      oppCards[0] = opp[o * 2];
      oppCards[1] = opp[o * 2 + 1];
      const sc = evaluate(oppCards, 7);
      if (sc > heroScore) {
        lost = true;
        break;
      }
      if (sc === heroScore) ties++;
      if (sc > best) best = sc;
    }
    if (!lost) total += 1 / (ties + 1);
  }
  return total / iterations;
}

// src/ai/handClass.ts
var Bucket = { Air: 0, Weak: 1, Medium: 2, Strong: 3, Monster: 4, Draw: 5 };
function hasStraight(mask) {
  for (let h = 12; h >= 4; h--) {
    const run = 31 << h - 4;
    if ((mask & run) === run) return true;
  }
  return (mask & 4111) === 4111;
}
function classify(hole, board) {
  const all = [...hole, ...board];
  const score = evaluate(all, all.length);
  const cat = score >> 20;
  const h1 = hole[0] >> 2;
  const h2 = hole[1] >> 2;
  if (board.length === 5 && evaluate(board, 5) === score) return { made: 0, draw: 0 };
  const counts = new Uint8Array(13);
  let boardMask = 0;
  for (const c of board) {
    counts[c >> 2]++;
    boardMask |= 1 << (c >> 2);
  }
  const distinct = [...new Set(board.map((c) => c >> 2))].sort((a, b) => b - a);
  const top = distinct[0];
  const second = distinct[1] ?? -1;
  const onePair = (r, kicker) => {
    if (r === top) return kicker >= 8 ? 3 : 2;
    if (r === second) return 2;
    return 1;
  };
  let made = 0;
  if (cat >= 6 || cat === 4) made = 4;
  else if (cat === 5) {
    const suitCount = [0, 0, 0, 0];
    for (const c of all) suitCount[c & 3]++;
    const s = suitCount.findIndex((n) => n >= 5);
    const onBoard = board.filter((c) => (c & 3) === s).length;
    const myHigh = Math.max(...hole.filter((c) => (c & 3) === s).map((c) => c >> 2), -1);
    made = onBoard >= 4 && myHigh < 9 ? 3 : 4;
  } else if (cat === 3) {
    if (h1 === h2) made = 4;
    else if (counts[h1] === 2 || counts[h2] === 2) {
      const kicker = counts[h1] === 2 ? h2 : h1;
      made = kicker >= 8 ? 4 : 3;
    } else made = 0;
  } else if (cat === 2) {
    const paired = [h1, h2].filter((r) => counts[r] >= 1);
    if (h1 !== h2 && paired.length === 2) made = 4;
    else if (h1 === h2) made = h1 > top ? 3 : 1;
    else if (paired.length === 1) made = onePair(paired[0], paired[0] === h1 ? h2 : h1);
    else made = 0;
  } else if (cat === 1) {
    if (h1 === h2) made = h1 > top ? 3 : h1 > second ? 2 : 1;
    else if (counts[h1]) made = onePair(h1, h2);
    else if (counts[h2]) made = onePair(h2, h1);
    else made = 0;
  }
  let draw = 0;
  if (board.length < 5 && made < 4) {
    const suitAll = [0, 0, 0, 0];
    for (const c of all) suitAll[c & 3]++;
    const flushDraw = hole.some((c) => suitAll[c & 3] === 4);
    const mask = boardMask | 1 << h1 | 1 << h2;
    let outs = 0;
    for (let r = 0; r < 13; r++) {
      if (mask & 1 << r) continue;
      if (hasStraight(mask | 1 << r) && !hasStraight(boardMask | 1 << r)) outs++;
    }
    const oesd = outs >= 2;
    draw = flushDraw && outs >= 1 ? 3 : flushDraw || oesd ? 2 : outs === 1 ? 1 : 0;
  }
  return { made, draw };
}
function bucketOf(c, river) {
  if (c.made === 4) return Bucket.Monster;
  if (c.made === 3) return Bucket.Strong;
  if (!river && c.draw >= 2) return Bucket.Draw;
  if (c.made === 2) return Bucket.Medium;
  if (c.made === 1) return Bucket.Weak;
  return Bucket.Air;
}

// src/engine/cards.ts
var RANKS = "23456789TJQKA";
var rankOf = (c) => c >> 2;
var suitOf = (c) => c & 3;
function fullDeck() {
  const d = [];
  for (let i = 0; i < 52; i++) d.push(i);
  return d;
}

// src/ai/preflopRanking.ts
var PREFLOP_ORDER = ["AA", "KK", "QQ", "JJ", "TT", "99", "AKs", "AQs", "88", "AJs", "AKo", "KQs", "ATs", "AQo", "KJs", "77", "KTs", "AJo", "A9s", "KQo", "QJs", "ATo", "QTs", "A8s", "KJo", "66", "K9s", "JTs", "A7s", "KTo", "A9o", "QJo", "A5s", "A6s", "Q9s", "A4s", "K8s", "QTo", "A8o", "A3s", "55", "J9s", "K7s", "A2s", "T9s", "K9o", "JTo", "Q8s", "A7o", "K6s", "A6o", "A5o", "J8s", "K5s", "Q9o", "A4o", "44", "K8o", "Q7s", "K4s", "T8s", "J9o", "A3o", "Q6s", "98s", "K7o", "J7s", "K3s", "T9o", "Q8o", "A2o", "K2s", "Q5s", "K6o", "T7s", "Q4s", "97s", "J8o", "K5o", "33", "87s", "T8o", "J6s", "Q3s", "Q7o", "J5s", "K4o", "T6s", "98o", "K3o", "Q2s", "96s", "Q6o", "J4s", "86s", "J7o", "76s", "J3s", "K2o", "Q5o", "22", "T7o", "T5s", "97o", "J2s", "Q4o", "95s", "T4s", "J6o", "85s", "75s", "65s", "87o", "Q3o", "T3s", "J5o", "T6o", "T2s", "Q2o", "54s", "96o", "84s", "94s", "J4o", "86o", "74s", "64s", "93s", "76o", "J3o", "92s", "T5o", "53s", "T4o", "J2o", "63s", "85o", "95o", "75o", "65o", "73s", "82s", "83s", "43s", "T3o", "52s", "54o", "94o", "62s", "84o", "72s", "T2o", "64o", "74o", "42s", "93o", "32s", "92o", "53o", "63o", "83o", "43o", "73o", "82o", "52o", "72o", "62o", "42o", "32o"];

// src/ai/ranges.ts
var COMBO_COUNT = 1326;
var COMBO_A = new Uint8Array(COMBO_COUNT);
var COMBO_B = new Uint8Array(COMBO_COUNT);
var COMBO_PCT = new Float32Array(COMBO_COUNT);
var COMBO_INDEX = new Int16Array(52 * 52).fill(-1);
var classIndex = new Map(PREFLOP_ORDER.map((n, i) => [n, i]));
function className(a, b) {
  let r1 = a >> 2, r2 = b >> 2;
  if (r2 > r1) [r1, r2] = [r2, r1];
  if (r1 === r2) return RANKS[r1] + RANKS[r2];
  return RANKS[r1] + RANKS[r2] + ((a & 3) === (b & 3) ? "s" : "o");
}
(function init() {
  const combosOf = (name) => name.length === 2 ? 6 : name.endsWith("s") ? 4 : 12;
  const mid = new Float32Array(PREFLOP_ORDER.length);
  let acc = 0;
  PREFLOP_ORDER.forEach((name, i) => {
    const n = combosOf(name);
    mid[i] = (acc + n / 2) / COMBO_COUNT;
    acc += n;
  });
  let k = 0;
  for (let a = 0; a < 52; a++)
    for (let b = a + 1; b < 52; b++) {
      COMBO_A[k] = a;
      COMBO_B[k] = b;
      COMBO_INDEX[a * 52 + b] = k;
      COMBO_INDEX[b * 52 + a] = k;
      COMBO_PCT[k] = mid[classIndex.get(className(a, b))];
      k++;
    }
})();
var comboIndex = (a, b) => COMBO_INDEX[a * 52 + b];
function handPct(a, b) {
  return COMBO_PCT[comboIndex(a, b)];
}
function fullRange() {
  return new Float32Array(COMBO_COUNT).fill(1);
}
function removeCards(r, dead) {
  if (!dead.length) return r;
  const isDead = new Uint8Array(52);
  for (const c of dead) isDead[c] = 1;
  for (let k = 0; k < COMBO_COUNT; k++) if (isDead[COMBO_A[k]] || isDead[COMBO_B[k]]) r[k] = 0;
  return r;
}
function totalWeight(r) {
  let s = 0;
  for (let k = 0; k < COMBO_COUNT; k++) s += r[k];
  return s;
}
function shapeByPct(r, w, floor = 0) {
  for (let k = 0; k < COMBO_COUNT; k++) if (r[k] > 0) r[k] *= Math.max(floor, w(COMBO_PCT[k]));
  return r;
}
var PREFLOP_FLOOR = 0.1;
var POSTFLOP_SOFTNESS = 0.6;
var POSTFLOP_FLOOR = 0.2;
function openPct(behind) {
  const table = [1, 0.48, 0.36, 0.24, 0.18, 0.15, 0.13, 0.11, 0.1, 0.09];
  return table[Math.min(Math.max(behind, 0), table.length - 1)];
}
function pushPct(stackBB, behind) {
  const base = Math.min(0.85, Math.max(0.08, 0.9 - 0.045 * stackBB));
  return Math.max(0.05, base * Math.max(0.35, 1 - 0.12 * Math.max(0, behind - 1)));
}
function callShovePct(shoveBB) {
  return Math.min(0.5, Math.max(0.08, 0.55 - 0.025 * shoveBB));
}
var fade = (pct, top, width = 0.05) => pct <= top ? 1 : Math.max(0, 1 - (pct - top) / width);
function preflopActionWeight(ctx, widen = 1) {
  const W = (x) => Math.min(1, x * widen);
  const aggressive = ctx.type === "raise" || ctx.type === "bet" || ctx.type === "allin";
  const shove = ctx.type === "allin" && ctx.stackBB <= 25;
  if (shove && ctx.raisesBefore === 0) {
    const p = W(pushPct(ctx.stackBB, ctx.behind));
    return (pct) => fade(pct, p, 0.06);
  }
  if (aggressive) {
    if (ctx.raisesBefore === 0) {
      const p = W(openPct(ctx.behind) * (ctx.isSmallBlind ? 1.1 : 1));
      return (pct) => fade(pct, p);
    }
    if (ctx.raisesBefore === 1) {
      const v2 = W(0.055), bl2 = W(0.14);
      return (pct) => pct <= v2 ? 1 : pct <= bl2 ? 0.22 : 0.03;
    }
    const v = W(0.03), bl = W(0.07);
    return (pct) => pct <= v ? 1 : pct <= bl ? 0.3 : 0.02;
  }
  if (ctx.type === "call") {
    if (ctx.raisesBefore === 0) {
      const top2 = W(0.55);
      return (pct) => pct <= 0.08 ? 0.3 : pct <= top2 ? 1 : 0.25;
    }
    if (ctx.raisesBefore === 1) {
      const top2 = W(ctx.isBigBlind ? 0.5 : ctx.isSmallBlind ? 0.2 : 0.22);
      if (ctx.toBB >= ctx.stackBB * 0.6) {
        const p = W(callShovePct(ctx.toBB));
        return (pct) => fade(pct, p, 0.05);
      }
      return (pct) => pct <= 0.035 ? 0.35 : pct > top2 + 0.08 ? 0.06 : fade(pct, top2, 0.08);
    }
    const top = W(0.09);
    return (pct) => pct <= 0.02 ? 0.5 : pct <= top ? 1 : 0.05;
  }
  if (ctx.type === "check") return (pct) => pct <= 0.1 ? 0.3 : 1;
  return () => 1;
}
var LIKELIHOOD = {
  //        air   weak  med   strong monster draw
  bet: [0.22, 0.25, 0.45, 0.85, 1, 0.6],
  raise: [0.08, 0.08, 0.15, 0.5, 1, 0.35],
  call: [0.15, 0.7, 1, 0.9, 0.5, 0.9],
  check: [1, 1, 1, 0.6, 0.35, 0.8]
};
function applyPostflopAction(r, board, type, softness = POSTFLOP_SOFTNESS, laterStreets = true) {
  const kind = type === "bet" ? "bet" : type === "raise" || type === "allin" ? "raise" : type === "call" ? "call" : type === "check" ? "check" : null;
  if (!kind) return;
  const lk = LIKELIHOOD[kind].map((x) => Math.max(POSTFLOP_FLOOR, Math.pow(x, softness)));
  if (laterStreets && (kind === "bet" || kind === "raise")) {
    const later = board.length >= 5 ? 0.6 : board.length === 4 ? 0.8 : 1;
    lk[0] *= later;
    lk[1] *= later;
  }
  const river = board.length >= 5;
  for (let k = 0; k < COMBO_COUNT; k++) {
    if (r[k] <= 0) continue;
    const b = bucketOf(classify([COMBO_A[k], COMBO_B[k]], board), river);
    r[k] *= lk[b];
  }
}
function bucketsOn(board) {
  const out = new Uint8Array(COMBO_COUNT);
  const river = board.length >= 5;
  for (let k = 0; k < COMBO_COUNT; k++) out[k] = bucketOf(classify([COMBO_A[k], COMBO_B[k]], board), river);
  return out;
}
var RangeSampler = class {
  constructor(r) {
    __publicField(this, "cum");
    __publicField(this, "total");
    this.cum = new Float64Array(COMBO_COUNT);
    let s = 0;
    for (let k = 0; k < COMBO_COUNT; k++) {
      s += r[k];
      this.cum[k] = s;
    }
    this.total = s;
  }
  get empty() {
    return this.total <= 0;
  }
  /** Weighted random combo index. */
  sample(rng) {
    const x = nextUint32(rng) / 4294967296 * this.total;
    let lo = 0, hi = COMBO_COUNT - 1;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (this.cum[mid] > x) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }
};

// src/ai/opponentStats.ts
var empty = () => ({ hands: 0, vpip: 0, pfr: 0, aggr: 0, passive: 0, faced: 0, folded: 0 });
function trackStats(table, events, street, dealtIn, perHand) {
  var _a;
  for (const e of events) {
    if (e.type === "handStart") {
      perHand.vpip.clear();
      perHand.pfr.clear();
      for (const id of dealtIn()) (table[id] ?? (table[id] = empty())).hands++;
    }
    if (e.type !== "action") continue;
    const st = table[_a = e.playerId] ?? (table[_a] = empty());
    const t = e.action.type;
    if (street === "preflop") {
      if ((t === "call" || t === "raise" || t === "bet" || t === "allin") && !perHand.vpip.has(e.playerId)) {
        perHand.vpip.add(e.playerId);
        st.vpip++;
      }
      if ((t === "raise" || t === "bet" || t === "allin") && !perHand.pfr.has(e.playerId)) {
        perHand.pfr.add(e.playerId);
        st.pfr++;
      }
    } else {
      if (t === "bet" || t === "raise" || t === "allin") st.aggr++;
      if (t === "call") st.passive++;
      if (t === "call" || t === "raise" || t === "fold") st.faced++;
      if (t === "fold") st.folded++;
    }
  }
}
var DEFAULT_TENDENCIES = { vpip: 0.24, pfr: 0.16, af: 1.6, foldToBet: 0.45 };
function tendencies(s) {
  if (!s) return DEFAULT_TENDENCIES;
  const d = DEFAULT_TENDENCIES;
  return {
    vpip: (s.vpip + 10 * d.vpip) / (s.hands + 10),
    pfr: (s.pfr + 10 * d.pfr) / (s.hands + 10),
    af: (s.aggr + 4 * d.af) / (s.passive + 4),
    foldToBet: (s.folded + 6 * d.foldToBet) / (s.faced + 6)
  };
}

// src/ai/expert.ts
var TUNE = {
  defence: 1.3,
  /** Softmax temperature as a fraction of the pot (randomness in close spots). */
  temp: 0.01,
  /** Extra EV required per chip when risking a big part of the stack (tournament survival). */
  risk: 0.08,
  /** Adapt pre-flop opening/3-bet ranges to observed opponents (1 = on). */
  adapt: 1,
  /** Value of checking (check-raise, pot control) for the out-of-position player without initiative, × pot. */
  donk: 0.08,
  /** One bet size per street for value and bluffs alike – sizes reveal nothing (1 = on). */
  fixedSizes: 1,
  /** Assume tighter ranges for all-in shoves before calling them (1 = on). */
  strictShove: 1,
  /** Heads-up: the button raises more instead of limping (1 = on). */
  huOpen: 1,
  /** Pure push/fold only from this effective stack (big blinds) down – above it, normal raises. */
  pushBB: 8,
  /** Re-shove over a raise only from this effective stack down (unless the raise commits us anyway). */
  reshoveBB: 12,
  /** Lower bound for how much an aggressive player's bets still say about their hand (× default). */
  minSoft: 0.75,
  /** Raise size facing a bet, as a multiple of that bet (fixed sizing mode). */
  raiseX: 3,
  /** Fewer bluffs assumed in turn/river bets (1 = on). */
  later: 1,
  /** Equity realisation out of position. */
  oop: 0.9,
  ...globalThis.__expertTune ?? {}
};
var DEFENCE = TUNE.defence;
var clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
function readsOf(c, id) {
  const t = tendencies(c.stats?.[id]);
  return {
    widenRaise: clamp(t.pfr / DEFAULT_TENDENCIES.pfr, 0.6, 4),
    widenCall: clamp(t.vpip / DEFAULT_TENDENCIES.vpip, 0.6, 3.5),
    // very aggressive players' bets say little about their hand
    softness: Math.min(1, POSTFLOP_SOFTNESS * clamp(DEFAULT_TENDENCIES.af / t.af, TUNE.minSoft, 1.6)),
    // players who rarely fold get bluffed less
    defence: clamp(DEFENCE * (1 - t.foldToBet) / (1 - DEFAULT_TENDENCIES.foldToBet), 0.7, 2.2)
  };
}
var BOARD_LEN = { preflop: 0, flop: 3, turn: 4, river: 5 };
function equityVs(hero, board, ranges, iterations, rng) {
  const samplers = ranges.map((r) => new RangeSampler(r)).filter((s) => !s.empty);
  if (samplers.length === 0) return 1;
  const used = new Uint32Array(52);
  const heroCards = new Int32Array(7);
  const oppCards = new Int32Array(7);
  const full = new Int32Array(5);
  const opp = new Int32Array(samplers.length * 2);
  heroCards[0] = hero[0];
  heroCards[1] = hero[1];
  for (let i = 0; i < board.length; i++) full[i] = board[i];
  let total = 0;
  let done = 0;
  for (let it = 1; it <= iterations; it++) {
    const stamp = it;
    used[hero[0]] = stamp;
    used[hero[1]] = stamp;
    for (const c of board) used[c] = stamp;
    let ok = true;
    for (let o = 0; o < samplers.length; o++) {
      let tries = 0;
      for (; ; ) {
        const k = samplers[o].sample(rng);
        const a = COMBO_A[k], b = COMBO_B[k];
        if (used[a] !== stamp && used[b] !== stamp) {
          used[a] = stamp;
          used[b] = stamp;
          opp[o * 2] = a;
          opp[o * 2 + 1] = b;
          break;
        }
        if (++tries > 40) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    for (let i = board.length; i < 5; i++) {
      let c;
      do
        c = nextUint32(rng) % 52;
      while (used[c] === stamp);
      used[c] = stamp;
      full[i] = c;
    }
    for (let i = 0; i < 5; i++) heroCards[2 + i] = oppCards[2 + i] = full[i];
    const hs = evaluate(heroCards, 7);
    let ties = 0;
    let lost = false;
    for (let o = 0; o < samplers.length; o++) {
      oppCards[0] = opp[o * 2];
      oppCards[1] = opp[o * 2 + 1];
      const s = evaluate(oppCards, 7);
      if (s > hs) {
        lost = true;
        break;
      }
      if (s === hs) ties++;
    }
    if (!lost) total += 1 / (ties + 1);
    done++;
  }
  return done ? total / done : 0.5;
}
function preflopOrder(view) {
  const alive2 = view.players.filter((p) => !p.eliminated);
  const bbIdx = alive2.findIndex((p) => p.isBigBlind);
  return alive2.map((_, i) => alive2[(bbIdx + 1 + i) % alive2.length].id);
}
function preflopContexts(c) {
  const out = /* @__PURE__ */ new Map();
  let raises = 0;
  let maxBet = c.bb;
  for (const h of c.history) {
    if (h.street !== "preflop") continue;
    const p = c.view.players.find((x) => x.id === h.playerId);
    if (!p) continue;
    const idx = c.order.indexOf(h.playerId);
    const amount = h.amount ?? (h.type === "raise" || h.type === "bet" ? maxBet * 3 : maxBet);
    const aggressive = h.type === "raise" || h.type === "bet" || h.type === "allin" && amount > maxBet;
    const ctx = {
      type: h.type === "allin" && !aggressive ? "call" : h.type,
      raisesBefore: raises,
      behind: Math.max(0, c.order.length - 1 - idx),
      isBigBlind: p.isBigBlind,
      isSmallBlind: p.isSmallBlind,
      stackBB: (p.stack + p.committed) / c.bb,
      toBB: amount / c.bb
    };
    if (aggressive) {
      raises++;
      maxBet = Math.max(maxBet, amount);
    }
    if (!out.has(h.playerId)) out.set(h.playerId, []);
    out.get(h.playerId).push(ctx);
  }
  return out;
}
function rangeOf(c, p, pre, floor = PREFLOP_FLOOR) {
  const reads = readsOf(c, p.id);
  const widen = (ctx) => ctx.type === "call" || ctx.type === "check" ? reads.widenCall : reads.widenRaise;
  const r = removeCards(fullRange(), [...c.hero, ...c.board]);
  for (const ctx of pre.get(p.id) ?? []) shapeByPct(r, preflopActionWeight(ctx, widen(ctx)), floor);
  for (const h of c.history) {
    if (h.playerId !== p.id || h.street === "preflop") continue;
    applyPostflopAction(r, c.board.slice(0, BOARD_LEN[h.street]), h.type, reads.softness, !!TUNE.later);
  }
  if (totalWeight(r) < 0.5) {
    const fresh = removeCards(fullRange(), [...c.hero, ...c.board]);
    for (const ctx of pre.get(p.id) ?? []) shapeByPct(fresh, preflopActionWeight(ctx, widen(ctx)));
    return fresh;
  }
  return r;
}
function respond(r, buckets, order, b, river, defence) {
  const total = totalWeight(r);
  const call = new Float32Array(COMBO_COUNT);
  if (total <= 0) return { fold: 0, callRange: call };
  const mdf = Math.min(1, defence / (1 + b));
  let cont = 0;
  for (let k = 0; k < COMBO_COUNT; k++) {
    if (r[k] <= 0) continue;
    const bk = buckets[k];
    if (bk === Bucket.Monster || bk === Bucket.Strong) call[k] = r[k];
    else if (!river && bk === Bucket.Draw) call[k] = r[k] * (b <= 0.75 ? 0.85 : 0.55);
    cont += call[k];
  }
  let need = mdf * total - cont;
  for (let i = 0; i < COMBO_COUNT && need > 0; i++) {
    const k = order[i];
    const rest = r[k] - call[k];
    if (rest <= 0) continue;
    const take = Math.min(rest, need);
    call[k] += take;
    need -= take;
    cont += take;
  }
  return { fold: Math.max(0, 1 - cont / total), callRange: call };
}
function pick(cands, temperature, rng) {
  const best = Math.max(...cands.map((c) => c.ev));
  const t = Math.max(temperature, 1e-6);
  const w = cands.map((c) => Math.exp((c.ev - best) / t));
  const sum = w.reduce((a, b) => a + b, 0);
  let x = nextFloat(rng) * sum;
  for (let i = 0; i < cands.length; i++) {
    x -= w[i];
    if (x <= 0) return cands[i].action;
  }
  return cands[cands.length - 1].action;
}
var roundTo = (v, unit) => Math.round(v / unit) * unit;
function riskAdjust(cands, me, callAmount) {
  if (!TUNE.risk) return;
  const stack = me.stack + me.bet;
  for (const c of cands) {
    const invest = c.action.type === "raise" ? c.action.amount - me.bet : c.action.type === "call" ? callAmount : 0;
    const share = invest / Math.max(1, stack);
    if (share > 0.25) c.ev -= TUNE.risk * invest * share;
  }
}
function raiseAction(view, to) {
  const l = view.legal;
  const unit = Math.max(1, Math.min(view.level.sb, 25));
  let amt = Math.max(l.minRaiseTo, Math.min(l.maxRaiseTo, roundTo(to, unit)));
  if (amt >= l.maxRaiseTo * 0.75) amt = l.maxRaiseTo;
  return { type: "raise", amount: amt };
}
var passive = (view) => view.legal.canCheck ? { type: "check" } : { type: "call" };
function preflop(c) {
  const { view, me, hero, bb, rng } = c;
  const l = view.legal;
  const pct = handPct(hero[0], hero[1]);
  const pre = preflopContexts(c);
  const aggressors = c.history.filter((h) => h.street === "preflop" && h.type !== "fold" && h.type !== "check" && h.type !== "call");
  const raises = [...pre.values()].flat().filter((x) => x.type === "raise" || x.type === "bet" || x.type === "allin").length;
  const behindPlayers = c.opponents.filter((o) => !o.allIn && !c.history.some((h) => h.playerId === o.id && h.street === "preflop"));
  const behind = behindPlayers.length;
  const oppMax = Math.max(...c.opponents.map((o) => o.stack + o.bet), 0);
  const effBB = Math.min(me.stack + me.bet, oppMax) / bb;
  const myStackBB = (me.stack + me.bet) / bb;
  const P = c.pot;
  const C = l.callAmount;
  const fold = l.canCheck ? { type: "check" } : { type: "fold" };
  const decision = (action, equity = 0) => ({ action, equity });
  const inPosition = behind === 0 || behind === 1 && behindPlayers[0]?.isBigBlind && !me.isSmallBlind;
  if (raises === 0 && effBB <= TUNE.pushBB && l.canRaise) {
    const shoveBB = Math.min(myStackBB, effBB);
    const cp = callShovePct(shoveBB);
    const pAllFold = behindPlayers.reduce((a) => a * (1 - cp), 1);
    const callerRange = removeCards(fullRange(), hero);
    shapeByPct(callerRange, (p) => p <= cp ? 1 : 0);
    const eq = equityVs(hero, [], [callerRange], Math.round(c.budget * 0.6), rng);
    const risk = l.maxRaiseTo - me.bet;
    const evShove = pAllFold * P + (1 - pAllFold) * (eq * (P + risk + Math.min(risk, oppMax)) - risk);
    const evOther = l.canCheck ? eq * P * 0.8 : 0;
    const cands = [
      { action: { type: "raise", amount: l.maxRaiseTo }, ev: evShove },
      { action: fold, ev: evOther }
    ];
    riskAdjust(cands, me, view.legal.callAmount);
    return decision(pick(cands, 0.15 * bb, rng), eq);
  }
  if (raises >= 1 && C > 0) {
    const last = aggressors[aggressors.length - 1];
    const raiser = c.opponents.find((o) => o.id === last?.playerId) ?? c.opponents[0];
    const shoveFacing = raiser.allIn || C >= 0.6 * me.stack;
    const rRange = rangeOf(c, raiser, pre, TUNE.strictShove && shoveFacing ? 0.02 : PREFLOP_FLOOR);
    const eq = equityVs(hero, [], [rRange], Math.round(c.budget * 0.7), rng);
    const R = C >= me.stack ? 1 : inPosition ? 0.95 : 0.85;
    const evCall = R * eq * (P + C) - C;
    const cands = [{ action: fold, ev: 0 }, { action: { type: "call" }, ev: evCall }];
    const shortOrAllIn = raiser.allIn || effBB <= TUNE.reshoveBB || C >= 0.35 * me.stack;
    if (l.canRaise && shortOrAllIn) {
      const jamBB = myStackBB;
      const callTop = raiser.allIn ? 1 : callShovePct(jamBB) * 0.7;
      const callers = new Float32Array(rRange);
      for (let k = 0; k < COMBO_COUNT; k++) if (COMBO_PCT[k] > callTop) callers[k] *= raiser.allIn ? 1 : 0.15;
      const f = raiser.allIn ? 0 : 1 - totalWeight(callers) / Math.max(1e-9, totalWeight(rRange));
      const eqC = raiser.allIn ? eq : equityVs(hero, [], [callers], Math.round(c.budget * 0.4), rng);
      const risk = l.maxRaiseTo - me.bet;
      const evJam = f * P + (1 - f) * (eqC * (P + risk + Math.min(risk, raiser.stack + raiser.bet - me.bet)) - risk);
      cands.push({ action: { type: "raise", amount: l.maxRaiseTo }, ev: evJam });
    } else if (l.canRaise) {
      const suited = (hero[0] & 3) === (hero[1] & 3);
      const loose = TUNE.adapt ? clamp(readsOf(c, raiser.id).widenRaise, 1, 3) : 1;
      const valueTop = (raises === 1 ? inPosition ? 0.06 : 0.045 : raises === 2 ? 0.022 : 0.012) * loose;
      const bluff = raises === 1 && suited && pct > 0.1 && pct < 0.24 && inPosition && nextFloat(rng) < 0.22;
      if (pct <= valueTop || bluff) {
        const to = raises === 1 ? view.currentBet * (inPosition ? 3 : 3.6) : view.currentBet * 2.3;
        const action = to >= (me.stack + me.bet) * 0.4 ? { type: "raise", amount: l.maxRaiseTo } : raiseAction(view, to);
        return decision(action, eq);
      }
    }
    riskAdjust(cands, me, view.legal.callAmount);
    return decision(pick(cands, 0.08 * bb, rng), eq);
  }
  const limpers = c.history.filter((h) => h.street === "preflop" && h.type === "call").length;
  if (l.canCheck) {
    if (l.canRaise && pct <= (limpers ? 0.12 : 0.2)) return decision(raiseAction(view, bb * (3 + limpers)), 0);
    return decision({ type: "check" }, 0);
  }
  const vpipBehind = behindPlayers.length ? behindPlayers.reduce((a, o) => a + tendencies(c.stats?.[o.id]).vpip, 0) / behindPlayers.length : DEFAULT_TENDENCIES.vpip;
  const steal = TUNE.adapt ? clamp(DEFAULT_TENDENCIES.vpip / vpipBehind, 0.75, 1.8) : 1;
  let top = Math.min(0.85, openPct(behind) * steal) * (limpers ? 0.7 : 1) * (me.isSmallBlind && behind === 1 ? 1.15 : 1);
  if (me.isSmallBlind && behind === 1) top = Math.max(top, TUNE.huOpen && c.opponents.length === 1 ? 0.62 : 0.45);
  const edge = 0.03;
  const pOpen = pct <= top - edge ? 1 : pct >= top + edge ? 0 : (top + edge - pct) / (2 * edge);
  if (l.canRaise && nextFloat(rng) < pOpen) {
    const size = me.isSmallBlind && behind === 1 ? 3 : behind <= 2 ? 2.3 : 2.5;
    return decision(raiseAction(view, bb * (size + limpers)), 0);
  }
  if (me.isSmallBlind && behind === 1 && limpers === 0 && pct <= 0.7 && C <= bb) return decision({ type: "call" }, 0);
  return decision(fold, 0);
}
function postflop(c) {
  const { view, me, hero, board, rng, bb } = c;
  const l = view.legal;
  const river = board.length >= 5;
  const pre = preflopContexts(c);
  const live = c.opponents.filter((o) => !o.folded);
  const ranges = live.map((o) => rangeOf(c, o, pre));
  const P = c.pot;
  const C = l.callAmount;
  const eqNow = equityVs(hero, board, ranges, Math.round(c.budget * 0.35), rng);
  const n = view.players.length;
  const btn = view.players.find((p) => p.isButton)?.seat ?? 0;
  const dist = (s) => (s - btn - 1 + n) % n;
  const inPosition = live.every((o) => dist(o.seat) < dist(me.seat));
  const R = river ? 1 : (inPosition ? 1 : TUNE.oop) * (live.length > 1 ? 0.95 : 1);
  const mine = classify(hero, board);
  const buckets = bucketsOn(board);
  const strength = new Float64Array(COMBO_COUNT);
  const cards = new Int32Array(7);
  for (let i = 0; i < board.length; i++) cards[2 + i] = board[i];
  for (let k = 0; k < COMBO_COUNT; k++) {
    cards[0] = COMBO_A[k];
    cards[1] = COMBO_B[k];
    strength[k] = evaluate(cards, 2 + board.length);
  }
  const order = Int32Array.from({ length: COMBO_COUNT }, (_, i) => i).sort((a, b) => strength[b] - strength[a]);
  const cands = [];
  const implied = !river && mine.draw >= 2 ? 0.08 * Math.min(P, me.stack) : 0;
  const lastAggr = [...c.history].reverse().find((h) => h.street !== view.street && (h.type === "bet" || h.type === "raise" || h.type === "allin"));
  const initiative = lastAggr?.playerId === me.id;
  const firstToAct = !c.history.some((h) => h.street === view.street);
  const checkBonus = !initiative && !inPosition && firstToAct ? TUNE.donk * P : 0;
  if (l.canCheck) cands.push({ action: { type: "check" }, ev: R * eqNow * P + checkBonus });
  else {
    cands.push({ action: { type: "fold" }, ev: 0 });
    const allInCall = C >= me.stack;
    cands.push({ action: { type: "call" }, ev: (allInCall ? 1 : R) * eqNow * (P + C) - C + (allInCall ? 0 : implied) });
  }
  if (l.canRaise) {
    const targets = /* @__PURE__ */ new Set();
    if (TUNE.fixedSizes) {
      const frac = board.length === 3 ? 0.45 : board.length === 4 ? 0.66 : 0.75;
      if (C === 0) targets.add(frac * P);
      else targets.add(TUNE.raiseX ? TUNE.raiseX * view.currentBet : view.currentBet + 0.9 * (P + C));
    } else if (C === 0) for (const f of [0.33, 0.66, 1]) targets.add(f * P);
    else for (const f of [0.75, 1.1]) targets.add(view.currentBet + f * (P + C));
    targets.add(l.maxRaiseTo);
    const seen = /* @__PURE__ */ new Set();
    const rangesFor = live.map((o, i) => ({ o, r: ranges[i] }));
    let evals = 0;
    for (const target of targets) {
      const action2 = raiseAction(view, target);
      if (seen.has(action2.amount)) continue;
      seen.add(action2.amount);
      const invest = action2.amount - me.bet;
      const b = invest / Math.max(1, P);
      let fAll = 1;
      let callersSum = 0;
      let callAmtSum = 0;
      const callRanges = [];
      for (const { o, r } of rangesFor) {
        if (o.allIn) {
          callRanges.push(r);
          continue;
        }
        const resp = respond(r, buckets, order, b, river, readsOf(c, o.id).defence);
        fAll *= resp.fold;
        callersSum += 1 - resp.fold;
        callAmtSum += Math.min(action2.amount - o.bet, o.stack);
        callRanges.push(resp.callRange);
      }
      const live2 = rangesFor.filter(({ o }) => !o.allIn).length;
      const pCalled = 1 - fAll;
      const eqCalled = pCalled > 1e-3 ? equityVs(hero, board, callRanges, Math.round(c.budget * 0.16), rng) : eqNow;
      evals++;
      const k = pCalled > 0 ? Math.max(1, callersSum / pCalled) : 0;
      const avgCall = live2 ? callAmtSum / live2 : 0;
      const potCalled = P + invest + k * avgCall;
      const allIn = action2.amount >= l.maxRaiseTo;
      const ev = fAll * P + pCalled * ((allIn ? 1 : R) * eqCalled * potCalled - invest);
      cands.push({ action: action2, ev });
      if (evals >= 4) break;
    }
  }
  riskAdjust(cands, me, view.legal.callAmount);
  const action = pick(cands, TUNE.temp * P + 0.25 * bb, rng);
  return { action: action.type === "raise" || action.type === "fold" ? action : passive(view), equity: eqNow };
}
function decideExpert(input) {
  const { view, history } = input;
  const me = view.players.find((p) => p.id === view.viewerId);
  if (!view.legal || !me) throw new Error("Bot asked to act out of turn");
  const hero = me.holeCards.filter((x) => x !== null);
  const c = {
    view,
    me,
    hero,
    board: view.board,
    bb: view.level.bb,
    pot: view.potTotal,
    history,
    rng: seedRng(input.seed),
    opponents: view.players.filter((p) => p.id !== me.id && !p.folded && !p.eliminated),
    order: preflopOrder(view),
    budget: input.profile.iterations,
    stats: input.stats
  };
  return view.street === "preflop" ? preflop(c) : postflop(c);
}

// src/ai/decide.ts
function gaussian(rng) {
  const u = Math.max(1e-9, nextFloat(rng));
  const v = nextFloat(rng);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function opponentRange(id, history, awareness) {
  if (awareness <= 0) return -10;
  let min = -10;
  const pre = history.filter((h) => h.playerId === id && h.street === "preflop");
  const raisedPre = pre.some((h) => h.type === "raise" || h.type === "bet" || h.type === "allin");
  const calledPre = pre.some((h) => h.type === "call");
  if (raisedPre) min = 6 + Math.round(2 * awareness);
  else if (calledPre) min = 3 + Math.round(2 * awareness);
  return min;
}
function decide(input) {
  if (input.profile.difficulty === "hard") return decideExpert(input);
  const { view, profile, history } = input;
  const rng = seedRng(input.seed);
  const legal = view.legal;
  const me = view.players.find((p) => p.id === view.viewerId);
  if (!legal || !me) throw new Error("Bot asked to act out of turn");
  const hero = me.holeCards.filter((c) => c !== null);
  const bb = view.level.bb;
  const unit = Math.max(1, Math.min(view.level.sb, 25));
  const preflop2 = view.street === "preflop";
  const toCall = legal.callAmount;
  const pot = view.potTotal;
  const stackBB = (me.stack + me.bet) / bb;
  const check = () => legal.canCheck ? { type: "check" } : { type: "fold" };
  const call = () => legal.canCheck ? { type: "check" } : { type: "call" };
  const allIn = () => legal.canRaise ? { type: "raise", amount: legal.maxRaiseTo } : toCall > 0 ? { type: "call" } : { type: "check" };
  const raiseTo = (target) => {
    if (!legal.canRaise) return call();
    let to = Math.round(target / unit) * unit;
    to = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, to));
    if (to >= legal.maxRaiseTo * 0.7) to = legal.maxRaiseTo;
    return { type: "raise", amount: to };
  };
  const opponents = view.players.filter((p) => p.id !== me.id && !p.folded && !p.eliminated);
  let simOpps;
  if (preflop2) {
    const voluntary = opponents.filter((o) => history.some((h) => h.playerId === o.id && h.street === "preflop" && h.type !== "fold" && h.type !== "check"));
    const passive2 = opponents.length - voluntary.length;
    const effective = Math.max(1, Math.min(opponents.length, Math.round(voluntary.length + passive2 * 0.3)));
    const ranges = voluntary.map((o) => opponentRange(o.id, history, profile.rangeAwareness));
    while (ranges.length < effective) ranges.push(profile.rangeAwareness > 0 ? 2 : -10);
    simOpps = ranges.slice(0, effective);
  } else {
    simOpps = opponents.map((o) => opponentRange(o.id, history, profile.rangeAwareness));
  }
  let equity = monteCarloEquity({ hero, board: view.board, opponentMinChen: simOpps, iterations: profile.iterations }, rng);
  if (!preflop2) {
    const aggressors = history.filter(
      (h) => h.street === view.street && h.playerId !== me.id && (h.type === "bet" || h.type === "raise" || h.type === "allin")
    ).length;
    equity *= Math.pow(1 - 0.1 * profile.rangeAwareness, aggressors);
  }
  const trueEquity = equity;
  equity = Math.min(1, Math.max(0, equity + gaussian(rng) * profile.noise));
  const nSim = simOpps.length;
  const fair = 1 / (nSim + 1);
  const strength = (equity - fair) / (1 - fair);
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  const strongT = 0.22 + profile.tightness;
  const monsterT = 0.55 + profile.tightness / 2;
  const r = () => nextFloat(rng);
  const buttonSeat = view.players.find((p) => p.isButton)?.seat ?? 0;
  const n = view.players.length;
  const distFromButton = (seat) => (seat - buttonSeat - 1 + n) % n;
  const inPosition = opponents.every((o) => distFromButton(o.seat) < distFromButton(me.seat));
  const decision = (action) => ({ action, equity: trueEquity });
  if (preflop2 && profile.pushFold && stackBB <= 11) {
    const facingRaise = view.currentBet > bb;
    if (!facingRaise) {
      const threshold = 0.2 * (stackBB / 11) - 0.05 + profile.tightness;
      if (strength > threshold) return decision(allIn());
      return decision(check());
    }
    if (equity >= potOdds + 0.03 + profile.tightness / 2 || strength > 0.25) return decision(allIn());
    return decision(check());
  }
  if (toCall === 0) {
    if (strength > monsterT && !preflop2 && r() < profile.slowplay) return decision(check());
    if (strength > strongT && r() < profile.aggression) {
      if (preflop2) return decision(raiseTo(bb * (2.5 + r())));
      const f = strength > monsterT ? 0.66 + r() * 0.4 : 0.45 + r() * 0.3;
      return decision(raiseTo(pot * f));
    }
    const bluffChance = profile.bluff * (nSim === 1 ? 1.2 : 0.5) * (preflop2 ? 0.5 : 1) * (inPosition ? 1.4 : 1);
    if (r() < bluffChance) return decision(raiseTo(preflop2 ? bb * 2.5 : pot * (0.4 + r() * 0.25)));
    return decision(check());
  }
  const raiseSize = (f) => preflop2 ? view.currentBet * (2.6 + r() * 0.8) + (pot - view.currentBet) * 0.3 : view.currentBet + (pot + toCall) * f;
  if (strength > monsterT) {
    if (r() < profile.aggression * (preflop2 ? 1 : 1 - profile.slowplay)) return decision(raiseTo(raiseSize(0.7 + r() * 0.4)));
    return decision(call());
  }
  if (strength > strongT + 0.1 && r() < profile.aggression * 0.45) return decision(raiseTo(raiseSize(0.6 + r() * 0.3)));
  const implied = preflop2 && toCall <= me.stack * 0.06 ? 0.05 : 0;
  const bigBet = toCall > (me.stack + me.bet) * 0.45;
  const behind = opponents.filter(
    (o) => !o.allIn && !history.some((h) => h.playerId === o.id && h.street === view.street)
  ).length;
  const needed = potOdds + profile.callMargin - implied + behind * 0.03 + (bigBet ? 0.06 + profile.tightness : 0);
  if (equity >= needed) return decision(call());
  if (!preflop2 && r() < profile.bluff * 0.35 && nSim === 1) return decision(raiseTo(raiseSize(0.6)));
  return decision(check());
}
function decideWithFallback(input) {
  try {
    return decide(input).action;
  } catch {
    const l = input.view.legal;
    return l?.canCheck ? { type: "check" } : { type: "fold" };
  }
}

// src/ai/botClient.ts
var BotClient = class {
  constructor() {
    __publicField(this, "worker", null);
    __publicField(this, "nextId", 1);
    __publicField(this, "pending", /* @__PURE__ */ new Map());
    if (typeof Worker !== "undefined") {
      try {
        this.worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
        this.worker.onmessage = (e) => {
          const { id, action, error } = e.data;
          const p = this.pending.get(id);
          if (!p) return;
          this.pending.delete(id);
          p.resolve(action && !error ? action : decideWithFallback(p.input));
        };
        this.worker.onerror = () => this.failAll();
      } catch {
        this.worker = null;
      }
    }
  }
  decide(input) {
    if (!this.worker) return Promise.resolve(decideWithFallback(input));
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve, input });
      this.worker.postMessage({ id, input });
    });
  }
  failAll() {
    this.worker?.terminate();
    this.worker = null;
    for (const [, p] of this.pending) p.resolve(decideWithFallback(p.input));
    this.pending.clear();
  }
  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
};

// src/ai/profiles.ts
var BASE = {
  easy: {
    iterations: 500,
    noise: 0.07,
    rangeAwareness: 0.5,
    tightness: 0.02,
    aggression: 0.6,
    bluff: 0.08,
    callMargin: 0,
    pushFold: true,
    slowplay: 0.08
  },
  medium: {
    iterations: 1200,
    noise: 0.03,
    rangeAwareness: 1,
    tightness: 0.03,
    aggression: 0.75,
    bluff: 0.11,
    callMargin: 0.02,
    pushFold: true,
    slowplay: 0.15
  },
  // iterations = Monte Carlo budget per decision of the expert engine
  hard: {
    iterations: 5e3,
    noise: 0,
    rangeAwareness: 1,
    tightness: 0,
    aggression: 0.8,
    bluff: 0.1,
    callMargin: 0,
    pushFold: true,
    slowplay: 0.1
  }
};
var STYLE = {
  rock: { tight: 0.07, aggr: 0.75, bluff: 0.4, call: 0.03 },
  tag: { tight: 0.03, aggr: 1.15, bluff: 1, call: 0.01 },
  lag: { tight: -0.04, aggr: 1.3, bluff: 1.6, call: -0.02 },
  station: { tight: -0.02, aggr: 0.55, bluff: 0.4, call: -0.07 },
  maniac: { tight: -0.08, aggr: 1.6, bluff: 2.6, call: -0.04 }
};
var POOLS = {
  easy: ["rock", "tag", "lag", "station", "maniac", "tag"],
  medium: ["tag", "lag", "tag", "rock", "lag"],
  hard: ["tag"]
};
function makeProfile(difficulty, personality) {
  const b = BASE[difficulty];
  const st = STYLE[personality];
  return {
    ...b,
    difficulty,
    personality,
    tightness: b.tightness + st.tight,
    aggression: Math.min(0.95, b.aggression * st.aggr),
    bluff: Math.min(0.35, b.bluff * st.bluff),
    callMargin: b.callMargin + st.call
  };
}
function randomPersonality(difficulty, rng) {
  const pool = POOLS[difficulty];
  return pool[nextInt(rng, pool.length)];
}

// src/engine/pots.ts
function computePots(contribs) {
  const live = contribs.filter((c) => !c.folded && c.amount > 0);
  if (live.length === 0) {
    const total = contribs.reduce((s, c) => s + c.amount, 0);
    return total > 0 ? [{ amount: total, eligible: [] }] : [];
  }
  const levels = [...new Set(live.map((c) => c.amount))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const c of contribs) amount += Math.max(0, Math.min(c.amount, level) - prev);
    const eligible = live.filter((c) => c.amount >= level).map((c) => c.id);
    if (amount > 0) {
      const last = pots[pots.length - 1];
      if (last && sameSet(last.eligible, eligible)) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = level;
  }
  let overflow = 0;
  for (const c of contribs) overflow += Math.max(0, c.amount - prev);
  if (overflow > 0 && pots.length) pots[pots.length - 1].amount += overflow;
  return pots;
}
function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

// src/engine/tournament.ts
var BASE_LEVELS = [
  [10, 20, 0],
  [15, 30, 0],
  [25, 50, 0],
  [50, 100, 0],
  [75, 150, 0],
  [100, 200, 25],
  [150, 300, 25],
  [200, 400, 50],
  [300, 600, 75],
  [400, 800, 100],
  [600, 1200, 150],
  [800, 1600, 200],
  [1e3, 2e3, 250],
  [1500, 3e3, 400],
  [2e3, 4e3, 500],
  [3e3, 6e3, 750],
  [4e3, 8e3, 1e3],
  [6e3, 12e3, 1500],
  [8e3, 16e3, 2e3],
  [1e4, 2e4, 3e3]
];
var HANDS_PER_LEVEL = { turbo: 6, normal: 10, slow: 15 };
var STARTING_STACKS = [1e3, 1500, 3e3, 5e3];
function blindLevels(startingStack) {
  const factor = Math.max(1, Math.round(startingStack / 1500));
  return BASE_LEVELS.map(([sb, bb, ante]) => ({ sb: sb * factor, bb: bb * factor, ante: ante * factor }));
}
var START_LEVEL_CHOICES = 5;
function makeTournamentConfig(startingStack, speed, startLevel = 0) {
  const all = blindLevels(startingStack);
  const from = Math.max(0, Math.min(Math.floor(startLevel), START_LEVEL_CHOICES - 1));
  return {
    startingStack,
    handsPerLevel: HANDS_PER_LEVEL[speed],
    levels: all.slice(from)
  };
}
function levelForHand(config, handNumber) {
  const idx = Math.floor(Math.max(0, handNumber - 1) / config.handsPerLevel);
  return Math.min(idx, config.levels.length - 1);
}

// src/engine/engine.ts
var RuleError = class extends Error {
};
function createTournament(config, entrants, seed) {
  if (entrants.length < 2 || entrants.length > 10) throw new RuleError("2\u201310 players required");
  const rng = seedRng(seed);
  const players = entrants.map((e, seat) => ({
    id: e.id,
    name: e.name,
    seat,
    kind: e.kind,
    stack: config.startingStack,
    bet: 0,
    committed: 0,
    holeCards: [],
    folded: false,
    allIn: false,
    acted: false,
    eliminated: false,
    lastAction: null,
    startStack: config.startingStack
  }));
  return {
    version: 1,
    config,
    players,
    rng,
    deck: [],
    board: [],
    phase: "idle",
    street: "preflop",
    handNumber: 0,
    levelIndex: 0,
    buttonSeat: nextInt(rng, players.length),
    sbSeat: -1,
    bbSeat: -1,
    toAct: -1,
    currentBet: 0,
    lastRaiseSize: 0,
    pots: [],
    revealed: [],
    lastResult: null,
    placements: [],
    seq: 0
  };
}
var alive = (p) => !p.eliminated;
var inHand = (p) => !p.eliminated && !p.folded;
var canAct = (p) => inHand(p) && !p.allIn;
function currentLevel(s) {
  return s.config.levels[s.levelIndex];
}
function nextSeat(s, from, pred) {
  const n = s.players.length;
  for (let i = 1; i <= n; i++) {
    const seat = (from + i) % n;
    if (pred(s.players[seat])) return seat;
  }
  return -1;
}
function playerById(s, id) {
  return s.players.find((p) => p.id === id);
}
function potTotal(s) {
  return s.pots.reduce((a, p) => a + p.amount, 0) + s.players.reduce((a, p) => a + p.bet, 0);
}
function putChips(p, amount) {
  const a = Math.min(amount, p.stack);
  p.stack -= a;
  p.bet += a;
  p.committed += a;
  if (p.stack === 0) p.allIn = true;
  return a;
}
function needsAction(s, p) {
  return canAct(p) && (!p.acted || p.bet < s.currentBet);
}
function findNextToAct(s, from) {
  const actors = s.players.filter(canAct);
  if (actors.length === 0) return -1;
  if (actors.length === 1 && actors[0].bet >= s.currentBet) return -1;
  return nextSeat(s, from, (p) => needsAction(s, p));
}
function startHand(s) {
  if (s.phase !== "idle" && s.phase !== "handComplete") throw new RuleError(`Cannot start hand in phase ${s.phase}`);
  const events = [];
  const living = s.players.filter(alive);
  if (living.length < 2) throw new RuleError("Not enough players");
  s.handNumber++;
  const lvl = levelForHand(s.config, s.handNumber);
  const levelChanged = lvl !== s.levelIndex;
  s.levelIndex = lvl;
  const level = currentLevel(s);
  for (const p of s.players) {
    p.bet = 0;
    p.committed = 0;
    p.holeCards = [];
    p.folded = p.eliminated;
    p.allIn = false;
    p.acted = false;
    p.lastAction = null;
    p.startStack = p.stack;
  }
  if (s.handNumber === 1) {
    if (!alive(s.players[s.buttonSeat])) s.buttonSeat = nextSeat(s, s.buttonSeat, alive);
  } else {
    s.buttonSeat = nextSeat(s, s.buttonSeat, alive);
  }
  if (living.length === 2) {
    s.sbSeat = s.buttonSeat;
    s.bbSeat = nextSeat(s, s.sbSeat, alive);
  } else {
    s.sbSeat = nextSeat(s, s.buttonSeat, alive);
    s.bbSeat = nextSeat(s, s.sbSeat, alive);
  }
  events.push({ type: "handStart", handNumber: s.handNumber, buttonSeat: s.buttonSeat, levelIndex: s.levelIndex });
  if (levelChanged) events.push({ type: "levelUp", levelIndex: lvl, level });
  s.board = [];
  s.pots = [];
  s.revealed = [];
  s.lastResult = null;
  s.street = "preflop";
  if (level.ante > 0) {
    for (const p of s.players.filter(alive)) {
      const a = Math.min(level.ante, p.stack);
      p.stack -= a;
      p.committed += a;
      if (p.stack === 0) p.allIn = true;
      events.push({ type: "blind", playerId: p.id, kind: "ante", amount: a });
    }
    s.pots = computePots(s.players.map((p) => ({ id: p.id, amount: p.committed, folded: !inHand(p) })));
  }
  const sb = s.players[s.sbSeat];
  const bb = s.players[s.bbSeat];
  events.push({ type: "blind", playerId: sb.id, kind: "sb", amount: putChips(sb, level.sb) });
  events.push({ type: "blind", playerId: bb.id, kind: "bb", amount: putChips(bb, level.bb) });
  s.currentBet = level.bb;
  s.lastRaiseSize = level.bb;
  s.deck = shuffle(fullDeck(), s.rng);
  for (let round = 0; round < 2; round++) {
    let seat = s.buttonSeat;
    for (let i = 0; i < living.length; i++) {
      seat = nextSeat(s, seat, alive);
      s.players[seat].holeCards.push(s.deck.pop());
    }
  }
  events.push({ type: "dealHole" });
  s.toAct = findNextToAct(s, s.bbSeat);
  if (s.toAct < 0) events.push(...endBettingRound(s));
  else s.phase = "betting";
  s.seq++;
  return events;
}
function legalActions(s, seat) {
  if (s.phase !== "betting" || s.toAct !== seat) return null;
  const p = s.players[seat];
  const callAmount = Math.min(Math.max(0, s.currentBet - p.bet), p.stack);
  const othersCanAct = s.players.some((q) => q !== p && canAct(q));
  const maxRaiseTo = p.bet + p.stack;
  const minRaiseTo = Math.min(s.currentBet + s.lastRaiseSize, maxRaiseTo);
  const canRaise = !p.acted && p.stack > callAmount && othersCanAct && maxRaiseTo > s.currentBet;
  return {
    canFold: true,
    canCheck: callAmount === 0,
    callAmount,
    canRaise,
    isBet: s.currentBet === 0,
    minRaiseTo,
    maxRaiseTo,
    currentBet: s.currentBet,
    playerBet: p.bet
  };
}
function applyAction(s, playerId, action) {
  if (s.phase !== "betting") throw new RuleError("No betting in progress");
  const p = s.players[s.toAct];
  if (!p || p.id !== playerId) throw new RuleError("Not your turn");
  const legal = legalActions(s, p.seat);
  const events = [];
  switch (action.type) {
    case "fold":
      p.folded = true;
      p.lastAction = { type: "fold", amount: 0 };
      break;
    case "check":
      if (!legal.canCheck) throw new RuleError("Cannot check");
      p.lastAction = { type: "check", amount: 0 };
      break;
    case "call": {
      if (legal.callAmount === 0) throw new RuleError("Nothing to call");
      const added = putChips(p, legal.callAmount);
      p.lastAction = { type: p.allIn ? "allin" : "call", amount: p.allIn ? p.bet : added };
      break;
    }
    case "raise": {
      if (!legal.canRaise) throw new RuleError("Cannot raise");
      const to = Math.floor(action.amount);
      if (!Number.isFinite(to) || to > legal.maxRaiseTo) throw new RuleError("Raise exceeds stack");
      if (to < legal.minRaiseTo && to !== legal.maxRaiseTo) throw new RuleError("Raise below minimum");
      if (to <= s.currentBet) throw new RuleError("Raise must exceed current bet");
      const wasBet = s.currentBet === 0;
      const increment = to - s.currentBet;
      putChips(p, to - p.bet);
      if (increment >= s.lastRaiseSize) {
        s.lastRaiseSize = increment;
        for (const q of s.players) if (q !== p && canAct(q)) q.acted = false;
      }
      s.currentBet = to;
      p.lastAction = { type: p.allIn ? "allin" : wasBet ? "bet" : "raise", amount: to };
      break;
    }
    default:
      throw new RuleError("Unknown action");
  }
  p.acted = true;
  events.push({ type: "action", playerId: p.id, action: p.lastAction });
  const remaining = s.players.filter(inHand);
  if (remaining.length === 1) {
    events.push(...returnUncalled(s), ...collectBets(s));
    events.push(...awardPots(s, false));
  } else {
    s.toAct = findNextToAct(s, p.seat);
    if (s.toAct < 0) events.push(...endBettingRound(s));
  }
  s.seq++;
  return events;
}
function endBettingRound(s) {
  const events = [...returnUncalled(s), ...collectBets(s)];
  s.phase = "streetComplete";
  s.toAct = -1;
  const live = s.players.filter(inHand);
  if (s.players.filter(canAct).length <= 1 && s.street !== "river") {
    const ids = live.map((p) => p.id).filter((id) => !s.revealed.includes(id));
    if (ids.length) {
      s.revealed.push(...ids);
      events.push({ type: "reveal", playerIds: ids });
    }
  }
  return events;
}
function returnUncalled(s) {
  let top = null;
  let second = 0;
  for (const p of s.players) {
    if (!top || p.bet > top.bet) {
      if (top) second = Math.max(second, top.bet);
      top = p;
    } else second = Math.max(second, p.bet);
  }
  if (!top || top.bet <= second) return [];
  const amount = top.bet - second;
  top.bet -= amount;
  top.committed -= amount;
  top.stack += amount;
  if (top.stack > 0) top.allIn = false;
  return [{ type: "uncalledReturned", playerId: top.id, amount }];
}
function collectBets(s) {
  const total = s.players.reduce((a, p) => a + p.bet, 0);
  for (const p of s.players) p.bet = 0;
  s.pots = computePots(s.players.map((p) => ({ id: p.id, amount: p.committed, folded: !inHand(p) })));
  return total > 0 ? [{ type: "betsCollected", total }] : [];
}
var NEXT_STREET = { preflop: "flop", flop: "turn", turn: "river", river: null };
function advance(s) {
  const events = [];
  switch (s.phase) {
    case "idle":
    case "handComplete":
      return startHand(s);
    case "streetComplete": {
      const next = NEXT_STREET[s.street];
      if (!next) {
        s.phase = "showdown";
        const ids = s.players.filter(inHand).map((p) => p.id).filter((id) => !s.revealed.includes(id));
        if (ids.length) {
          s.revealed.push(...ids);
          events.push({ type: "reveal", playerIds: ids });
        }
        break;
      }
      s.deck.pop();
      const count = next === "flop" ? 3 : 1;
      const cards = [];
      for (let i = 0; i < count; i++) cards.push(s.deck.pop());
      s.board.push(...cards);
      s.street = next;
      s.currentBet = 0;
      s.lastRaiseSize = currentLevel(s).bb;
      for (const p of s.players) {
        p.acted = false;
        if (canAct(p)) p.lastAction = null;
      }
      events.push({ type: "board", street: next, cards });
      s.toAct = findNextToAct(s, s.buttonSeat);
      s.phase = s.toAct < 0 ? "streetComplete" : "betting";
      break;
    }
    case "showdown":
      events.push(...awardPots(s, true));
      break;
    default:
      throw new RuleError(`Cannot advance from ${s.phase}`);
  }
  s.seq++;
  return events;
}
function seatOrderFromButton(s) {
  const n = s.players.length;
  const m = /* @__PURE__ */ new Map();
  for (let i = 1; i <= n; i++) m.set(s.players[(s.buttonSeat + i) % n].id, i);
  return m;
}
function awardPots(s, showdown) {
  const events = [];
  const order = seatOrderFromButton(s);
  const result = { showdown, pots: [], hands: {} };
  const scores = /* @__PURE__ */ new Map();
  if (showdown) {
    for (const p of s.players.filter(inHand)) {
      const d = describeHand([...p.holeCards, ...s.board]);
      scores.set(p.id, d.score);
      result.hands[p.id] = { key: d.key, score: d.score, best: d.best };
    }
  }
  s.pots.forEach((pot, potIndex) => {
    let candidates = pot.eligible.filter((id) => inHand(playerById(s, id)));
    if (candidates.length === 0) candidates = s.players.filter(inHand).map((p) => p.id);
    let winners = candidates;
    if (showdown && candidates.length > 1) {
      const best = Math.max(...candidates.map((id) => scores.get(id) ?? evaluateFor(s, id)));
      winners = candidates.filter((id) => (scores.get(id) ?? evaluateFor(s, id)) === best);
    }
    winners = [...winners].sort((a, b) => order.get(a) - order.get(b));
    const share = Math.floor(pot.amount / winners.length);
    let rest = pot.amount - share * winners.length;
    const potResult = { potIndex, amount: pot.amount, winners: [] };
    for (const id of winners) {
      const amt = share + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      playerById(s, id).stack += amt;
      potResult.winners.push({ playerId: id, amount: amt });
    }
    if (showdown) {
      const h = result.hands[winners[0]];
      if (h) {
        potResult.handKey = h.key;
        potResult.best = h.best;
      }
    }
    result.pots.push(potResult);
    events.push({ type: "potAwarded", ...potResult });
  });
  s.pots = [];
  s.lastResult = result;
  s.phase = "handComplete";
  s.toAct = -1;
  events.push(...handleEliminations(s));
  return events;
}
function evaluateFor(s, id) {
  const p = playerById(s, id);
  return evaluate([...p.holeCards, ...s.board]);
}
function handleEliminations(s) {
  const events = [];
  const livingBefore = s.players.filter(alive).length;
  const busted = s.players.filter((p) => alive(p) && p.stack === 0).sort((a, b) => b.startStack - a.startStack || a.seat - b.seat);
  busted.forEach((p, i) => {
    p.eliminated = true;
    const place = livingBefore - busted.length + 1 + i;
    s.placements.push({ playerId: p.id, place, handNumber: s.handNumber });
    events.push({ type: "eliminated", playerId: p.id, place });
  });
  const living = s.players.filter(alive);
  if (living.length === 1) {
    s.placements.push({ playerId: living[0].id, place: 1, handNumber: s.handNumber });
    s.phase = "tournamentComplete";
    events.push({ type: "tournamentComplete", winnerId: living[0].id });
  }
  return events;
}
function totalChips(s) {
  return s.players.reduce((a, p) => a + p.stack + p.bet, 0) + s.pots.reduce((a, p) => a + p.amount, 0);
}

// src/engine/view.ts
function toView(s, viewerId) {
  const level = currentLevel(s);
  const hpl = s.config.handsPerLevel;
  const hasNext = s.levelIndex < s.config.levels.length - 1;
  const viewer = viewerId ? s.players.find((p) => p.id === viewerId) : void 0;
  return {
    viewerId,
    seq: s.seq,
    phase: s.phase,
    street: s.street,
    handNumber: s.handNumber,
    levelIndex: s.levelIndex,
    level,
    nextLevel: hasNext ? s.config.levels[s.levelIndex + 1] : null,
    handsUntilNextLevel: hasNext ? hpl - (Math.max(1, s.handNumber) - 1) % hpl - 1 : 0,
    board: [...s.board],
    pots: s.pots.map((p) => ({ amount: p.amount, eligible: [...p.eligible] })),
    potTotal: potTotal(s),
    currentBet: s.currentBet,
    minRaise: s.lastRaiseSize,
    players: s.players.map((p) => {
      const visible = p.id === viewerId || s.revealed.includes(p.id);
      return {
        id: p.id,
        name: p.name,
        seat: p.seat,
        kind: p.kind,
        stack: p.stack,
        bet: p.bet,
        committed: p.committed,
        holeCards: p.holeCards.map((c) => visible ? c : null),
        folded: p.folded,
        allIn: p.allIn,
        acted: p.acted,
        eliminated: p.eliminated,
        lastAction: p.lastAction ? { ...p.lastAction } : null,
        isButton: s.handNumber > 0 && p.seat === s.buttonSeat,
        isSmallBlind: s.handNumber > 0 && p.seat === s.sbSeat,
        isBigBlind: s.handNumber > 0 && p.seat === s.bbSeat,
        isToAct: s.phase === "betting" && p.seat === s.toAct
      };
    }),
    toActId: s.phase === "betting" && s.toAct >= 0 ? s.players[s.toAct].id : null,
    legal: viewer ? legalActions(s, viewer.seat) : null,
    lastResult: s.lastResult ? structuredClone(s.lastResult) : null,
    placements: s.placements.map((p) => ({ ...p })),
    startingStack: s.config.startingStack
  };
}

// src/game/storage.ts
var GAME_KEY = "rubics.poker.savedGame.v1";
var SETUP_KEY = "rubics.poker.lastSetup.v1";
var STATS_KEY = "rubics.poker.stats.v1";
function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}
var storage = {
  loadGame: () => {
    const g = read(GAME_KEY);
    return g && g.version === 1 && g.state?.version === 1 ? g : null;
  },
  saveGame: (g) => write(GAME_KEY, g),
  clearGame: () => {
    try {
      localStorage.removeItem(GAME_KEY);
    } catch {
    }
  },
  loadSetup: () => read(SETUP_KEY),
  saveSetup: (s) => write(SETUP_KEY, s),
  loadStats: () => read(STATS_KEY) ?? { tournaments: 0, wins: 0, bestPlace: null, handsPlayed: 0 },
  saveStats: (s) => write(STATS_KEY, s)
};

// src/game/localController.ts
var HERO_ID = "hero";
var BOT_NAMES = [
  "Ava",
  "Ben",
  "Chen",
  "Dana",
  "Emil",
  "Fiona",
  "Gus",
  "Hana",
  "Ivo",
  "Jule",
  "Kai",
  "Lena",
  "Milo",
  "Nora",
  "Otto",
  "Pia",
  "Quinn",
  "Rosa",
  "Sam",
  "Tara",
  "Uli",
  "Vera",
  "Wes",
  "Yara",
  "Zoe"
];
function newGame(setup) {
  const seed = randomSeed();
  const rng = seedRng(seed ^ 1540483477);
  const names = shuffle([...BOT_NAMES], rng).filter((n) => n.toLowerCase() !== setup.playerName.trim().toLowerCase());
  const entrants = [{ id: HERO_ID, name: setup.playerName.trim() || "Du", kind: "human" }];
  const personalities = {};
  for (let i = 1; i < setup.totalPlayers; i++) {
    const id = `bot${i}`;
    entrants.push({ id, name: names[i - 1], kind: "bot" });
    personalities[id] = randomPersonality(setup.difficulty, rng);
  }
  const state = createTournament(makeTournamentConfig(setup.startingStack, setup.blindSpeed, setup.startLevel ?? 0), entrants, seed);
  return { setup, state, personalities, history: [], log: [] };
}
var LocalGameController = class {
  constructor(game, pacing) {
    this.pacing = pacing;
    __publicField(this, "g");
    __publicField(this, "bots", new BotClient());
    __publicField(this, "profiles", /* @__PURE__ */ new Map());
    __publicField(this, "listeners", /* @__PURE__ */ new Set());
    __publicField(this, "lastEvents", []);
    __publicField(this, "thinkingId", null);
    __publicField(this, "running", false);
    __publicField(this, "disposed", false);
    __publicField(this, "paused", false);
    __publicField(this, "resumeGate", null);
    __publicField(this, "continueGate", null);
    __publicField(this, "awaitingContinue", false);
    __publicField(this, "spectating", false);
    __publicField(this, "logId", 0);
    __publicField(this, "perHand", { vpip: /* @__PURE__ */ new Set(), pfr: /* @__PURE__ */ new Set() });
    __publicField(this, "rng", seedRng(randomSeed()));
    __publicField(this, "timers", /* @__PURE__ */ new Set());
    this.g = {
      setup: game.setup,
      state: game.state,
      personalities: game.personalities,
      history: game.history ?? [],
      log: game.log ?? [],
      statsRecorded: game.statsRecorded,
      oppStats: game.oppStats ?? {}
    };
    this.logId = this.g.log.reduce((m, e) => Math.max(m, e.id), 0);
    for (const [id, pers] of Object.entries(this.g.personalities)) {
      this.profiles.set(id, makeProfile(this.g.setup.difficulty, pers));
    }
    this.persist();
    queueMicrotask(() => this.run());
  }
  // ───────────── public API ─────────────
  subscribe(run) {
    this.listeners.add(run);
    run(this.snapshot());
    return () => this.listeners.delete(run);
  }
  act(action) {
    if (this.disposed) return;
    const s = this.g.state;
    if (s.phase !== "betting" || s.players[s.toAct]?.id !== HERO_ID) return;
    try {
      this.apply(applyAction(s, HERO_ID, action));
    } catch (e) {
      if (e instanceof RuleError) {
        console.warn("Illegal action ignored:", e.message);
        return;
      }
      throw e;
    }
    this.run();
  }
  setPaused(paused) {
    this.paused = paused;
    if (!paused && this.resumeGate) {
      this.resumeGate();
      this.resumeGate = null;
    }
    this.emit();
  }
  spectate() {
    this.spectating = true;
    this.emit();
    this.run();
  }
  continueAfterShowdown() {
    this.continueGate?.();
    this.continueGate = null;
  }
  dispose() {
    this.disposed = true;
    this.continueGate?.();
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.resumeGate?.();
    this.bots.dispose();
    this.listeners.clear();
  }
  // ───────────── game loop ─────────────
  get hero() {
    return this.g.state.players.find((p) => p.id === HERO_ID);
  }
  async run() {
    if (this.running || this.disposed) return;
    this.running = true;
    try {
      while (!this.disposed) {
        await this.waitIfPaused();
        const s = this.g.state;
        if (s.phase === "tournamentComplete") break;
        if (this.hero.eliminated && !this.spectating) break;
        if (s.phase === "betting") {
          const p = s.players[s.toAct];
          if (p.kind === "human") break;
          await this.botTurn(p);
        } else {
          if (this.shouldHold(s)) {
            await this.holdForContinue();
            if (this.disposed) break;
            this.apply(advance(this.g.state));
            continue;
          }
          await this.sleep(this.delayFor(s));
          if (!this.disposed && this.shouldHold(this.g.state)) continue;
          if (this.disposed) break;
          await this.waitIfPaused();
          if (this.g.state.phase === "tournamentComplete") break;
          this.apply(advance(this.g.state));
        }
      }
    } finally {
      this.running = false;
    }
  }
  /** Showdown finished with cards face up and the player wants to look at them. */
  shouldHold(s) {
    return s.phase === "handComplete" && !!s.lastResult?.showdown && !!this.pacing.holdAfterShowdown?.();
  }
  holdForContinue() {
    this.awaitingContinue = true;
    this.emit();
    return new Promise((resolve) => {
      this.continueGate = () => {
        this.awaitingContinue = false;
        resolve();
      };
    });
  }
  fastFactor() {
    const h = this.hero;
    return h.eliminated ? 0.45 : h.folded ? 0.6 : 1;
  }
  delayFor(s) {
    const sp = this.pacing.speed() * this.fastFactor();
    switch (s.phase) {
      case "idle":
        return 400 * sp;
      case "streetComplete":
        return (s.revealed.length ? 1300 : 750) * sp;
      case "showdown":
        return 1100 * sp;
      case "handComplete":
        return (s.lastResult?.showdown ? 3e3 : 1700) * sp;
      default:
        return 500 * sp;
    }
  }
  async botTurn(p) {
    const s = this.g.state;
    this.thinkingId = p.id;
    this.emit();
    const profile = this.profiles.get(p.id) ?? makeProfile(this.g.setup.difficulty, "tag");
    const minThink = (450 + nextFloat(this.rng) * 900) * this.pacing.speed() * this.fastFactor();
    const [action] = await Promise.all([
      this.bots.decide({
        view: toView(s, p.id),
        profile,
        history: this.g.history,
        seed: nextInt(this.rng, 2 ** 31),
        stats: this.g.oppStats
      }),
      this.sleep(minThink)
    ]);
    if (this.disposed) return;
    await this.waitIfPaused();
    this.thinkingId = null;
    if (s !== this.g.state || s.phase !== "betting" || s.players[s.toAct]?.id !== p.id) return;
    try {
      this.apply(applyAction(s, p.id, action));
    } catch {
      this.apply(applyAction(s, p.id, s.players[s.toAct].bet >= s.currentBet ? { type: "check" } : { type: "fold" }));
    }
  }
  apply(events) {
    var _a;
    const s = this.g.state;
    for (const e of events) {
      if (e.type === "handStart") {
        this.g.history = [];
        if (!this.hero.eliminated) this.bumpStats((st) => st.handsPlayed++);
      }
      if (e.type === "action") this.g.history.push({ playerId: e.playerId, street: s.street, type: e.action.type, amount: e.action.amount });
      if (e.type !== "dealHole") this.g.log.push({ id: ++this.logId, hand: s.handNumber, event: e });
      if (e.type === "eliminated" && e.playerId === HERO_ID) this.recordResult(e.place);
      if (e.type === "tournamentComplete" && e.winnerId === HERO_ID) this.recordResult(1);
    }
    if (this.g.log.length > 400) this.g.log.splice(0, this.g.log.length - 400);
    trackStats((_a = this.g).oppStats ?? (_a.oppStats = {}), events, s.street, () => s.players.filter((p) => !p.eliminated).map((p) => p.id), this.perHand);
    this.lastEvents = events;
    this.persist();
    this.emit();
  }
  recordResult(place) {
    if (this.g.statsRecorded) return;
    this.g.statsRecorded = true;
    this.bumpStats((st) => {
      st.tournaments++;
      if (place === 1) st.wins++;
      st.bestPlace = st.bestPlace === null ? place : Math.min(st.bestPlace, place);
    });
  }
  bumpStats(fn) {
    const st = storage.loadStats();
    fn(st);
    storage.saveStats(st);
  }
  persist() {
    if (this.g.state.phase === "tournamentComplete") {
      storage.clearGame();
      return;
    }
    storage.saveGame({
      version: 1,
      savedAt: Date.now(),
      setup: this.g.setup,
      state: this.g.state,
      personalities: this.g.personalities,
      history: this.g.history,
      log: this.g.log.slice(-150),
      statsRecorded: this.g.statsRecorded,
      oppStats: this.g.oppStats
    });
  }
  snapshot() {
    return {
      view: toView(this.g.state, HERO_ID),
      events: this.lastEvents,
      log: this.g.log,
      thinkingId: this.thinkingId,
      heroEliminated: this.hero.eliminated,
      spectating: this.spectating,
      paused: this.paused,
      personalities: this.g.personalities,
      awaitingContinue: this.awaitingContinue
    };
  }
  emit() {
    if (this.disposed) return;
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }
  sleep(ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.timers.delete(t);
        resolve();
      }, Math.max(0, ms));
      this.timers.add(t);
    });
  }
  waitIfPaused() {
    if (!this.paused || this.disposed) return Promise.resolve();
    return new Promise((resolve) => this.resumeGate = resolve);
  }
};

// src/game/betSizing.ts
function snapRaiseTo(v, unit, min, max) {
  if (!Number.isFinite(v) || v >= max) return max;
  if (v <= min) return min;
  const r = Math.round(v / unit) * unit;
  if (max - r < unit) return max;
  return Math.max(min, r);
}
export {
  HANDS_PER_LEVEL,
  HERO_ID,
  LocalGameController,
  STARTING_STACKS,
  advance,
  applyAction,
  createTournament,
  decideWithFallback,
  legalActions,
  makeProfile,
  makeTournamentConfig,
  newGame,
  rankOf,
  snapRaiseTo,
  startHand,
  storage,
  suitOf,
  toView,
  totalChips
};
