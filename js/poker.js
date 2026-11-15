// Poker-Variante: Texas-Hold'em-Tisch (ohne Würfel).
// Pocket Cards für sechs Spieler, fünf Gemeinschaftskarten, Kartenstapel,
// Dealer-Button und Chips – inklusive Animation für das Kartengeben.

import * as THREE from '../vendor/three.module.min.js';

// Maße relativ zur Kartenbreite (echte Pokerkarte 63 × 88 mm, Chip 39 × 3,3 mm)
const CARD_W = 2.2, CARD_H = 3.08, THICK = 0.012;
const CHIP_R = 0.68, CHIP_H = 0.115;
const SUITS = ['spade', 'heart', 'diamond', 'club'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RED = '#b9121f', BLACK = '#18181c', GOLD = '#c39a2c';
const SERIF = 'Georgia, "Times New Roman", serif';

const rnd = (range) => (Math.random() - 0.5) * 2 * range;
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// --- Kartenbilder ---------------------------------------------------------------

function drawSuit(g, suit, cx, cy, size, flip = false) {
  g.save();
  g.translate(cx, cy);
  if (flip) g.rotate(Math.PI);
  g.scale(size, size);
  g.beginPath();
  if (suit === 'heart') {
    g.moveTo(0, 0.5);
    g.bezierCurveTo(-0.75, -0.05, -0.45, -0.6, 0, -0.25);
    g.bezierCurveTo(0.45, -0.6, 0.75, -0.05, 0, 0.5);
  } else if (suit === 'diamond') {
    g.moveTo(0, -0.5);
    g.quadraticCurveTo(0.14, -0.2, 0.37, 0);
    g.quadraticCurveTo(0.14, 0.2, 0, 0.5);
    g.quadraticCurveTo(-0.14, 0.2, -0.37, 0);
    g.quadraticCurveTo(-0.14, -0.2, 0, -0.5);
  } else if (suit === 'spade') {
    g.moveTo(0, -0.5);
    g.bezierCurveTo(-0.75, 0.05, -0.45, 0.6, 0, 0.22);
    g.bezierCurveTo(0.45, 0.6, 0.75, 0.05, 0, -0.5);
    g.moveTo(0, 0.1);
    g.quadraticCurveTo(-0.02, 0.4, -0.19, 0.5);
    g.lineTo(0.19, 0.5);
    g.quadraticCurveTo(0.02, 0.4, 0, 0.1);
  } else {
    for (const [x, y] of [[0, -0.25], [-0.23, 0.08], [0.23, 0.08]]) {
      g.moveTo(x + 0.22, y);
      g.arc(x, y, 0.22, 0, Math.PI * 2);
    }
    g.moveTo(0, -0.02);
    g.quadraticCurveTo(-0.02, 0.4, -0.18, 0.5);
    g.lineTo(0.18, 0.5);
    g.quadraticCurveTo(0.02, 0.4, 0, -0.02);
  }
  g.closePath();
  g.fill();
  g.restore();
}

// Papier: leicht cremefarben, feines Korn, Leinenprägung, vergilbte Ränder
function drawPaper(g, w, h) {
  g.fillStyle = '#f8f5ea';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '120,100,60' : '255,255,255'},${Math.random() * 0.05})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.2, 1.2);
  }
  g.strokeStyle = 'rgba(90,70,40,0.022)';
  g.lineWidth = 0.5;
  g.beginPath();
  for (let x = 0; x < w; x += 2.5) { g.moveTo(x, 0); g.lineTo(x, h); }
  for (let y = 0; y < h; y += 2.5) { g.moveTo(0, y); g.lineTo(w, y); }
  g.stroke();
}

// Gebrauchsspuren: abgegriffene, leicht schmutzige Kanten und Ecken, feine Knicke
function drawCardWear(g, w, h, dirt = 1) {
  const edge = 12;
  for (const [x0, y0, x1, y1] of [[0, 0, edge, 0], [w, 0, w - edge, 0], [0, 0, 0, edge], [0, h, 0, h - edge]]) {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, `rgba(96,72,38,${0.2 * dirt})`);
    grad.addColorStop(1, 'rgba(96,72,38,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
  for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    const r = 18 + Math.random() * 22;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, `rgba(84,62,34,${(0.16 + Math.random() * 0.2) * dirt})`);
    grad.addColorStop(1, 'rgba(84,62,34,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
  // Fingerschmutz in der Fläche
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 20 + Math.random() * 45;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(90,70,45,${0.05 * dirt})`);
    grad.addColorStop(1, 'rgba(90,70,45,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
  // feine Knicke und Kratzer
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI, len = 20 + Math.random() * 90;
    g.strokeStyle = `rgba(60,45,25,${0.05 + Math.random() * 0.06})`;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // Schnittkante
  g.strokeStyle = 'rgba(40,30,15,0.28)';
  g.lineWidth = 1.6;
  g.strokeRect(0, 0, w, h);
}

const PIPS = {
  2: [[0.5, 0.2], [0.5, 0.8]],
  3: [[0.5, 0.2], [0.5, 0.5], [0.5, 0.8]],
  4: [[0.3, 0.2], [0.7, 0.2], [0.3, 0.8], [0.7, 0.8]],
  5: [[0.3, 0.2], [0.7, 0.2], [0.5, 0.5], [0.3, 0.8], [0.7, 0.8]],
  6: [[0.3, 0.2], [0.7, 0.2], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8], [0.7, 0.8]],
  7: [[0.3, 0.2], [0.7, 0.2], [0.5, 0.35], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8], [0.7, 0.8]],
  8: [[0.3, 0.2], [0.7, 0.2], [0.5, 0.35], [0.3, 0.5], [0.7, 0.5], [0.5, 0.65], [0.3, 0.8], [0.7, 0.8]],
  9: [[0.3, 0.2], [0.7, 0.2], [0.3, 0.4], [0.7, 0.4], [0.5, 0.5], [0.3, 0.6], [0.7, 0.6], [0.3, 0.8], [0.7, 0.8]],
  10: [[0.3, 0.2], [0.7, 0.2], [0.5, 0.3], [0.3, 0.4], [0.7, 0.4], [0.3, 0.6], [0.7, 0.6], [0.5, 0.7], [0.3, 0.8], [0.7, 0.8]],
};

// Bildkarte: gerahmtes, punktsymmetrisches Feld mit Rautenmuster, Krone und Buchstabe
function drawCourt(g, w, h, rank, suit, color) {
  const x0 = w * 0.235, y0 = h * 0.135, fw = w * 0.53, fh = h * 0.73;
  g.save();
  g.beginPath();
  g.rect(x0, y0, fw, fh);
  g.clip();
  g.fillStyle = color === RED ? '#f6e3d6' : '#e6e6ee';
  g.fillRect(x0, y0, fw, fh);
  // Rautenmuster in Gold und Kartenfarbe
  g.lineWidth = 1;
  for (let d = -fh; d < fw + fh; d += 13) {
    g.strokeStyle = 'rgba(195,154,44,0.55)';
    g.beginPath();
    g.moveTo(x0 + d, y0);
    g.lineTo(x0 + d + fh, y0 + fh);
    g.stroke();
    g.strokeStyle = color === RED ? 'rgba(185,18,31,0.28)' : 'rgba(24,24,40,0.28)';
    g.beginPath();
    g.moveTo(x0 + d, y0);
    g.lineTo(x0 + d - fh, y0 + fh);
    g.stroke();
  }
  // diagonales Band als Spiegelachse
  g.save();
  g.translate(w / 2, h / 2);
  g.rotate(-0.62);
  g.fillStyle = color;
  g.fillRect(-fh, -9, fh * 2, 18);
  g.fillStyle = GOLD;
  g.fillRect(-fh, -5.5, fh * 2, 2);
  g.fillRect(-fh, 3.5, fh * 2, 2);
  g.restore();
  // zwei Hälften, um 180° gedreht
  for (const turn of [0, Math.PI]) {
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(turn);
    const cy = -fh * 0.25;
    g.fillStyle = '#fbf8ee';
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(0, cy, 37, 45, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = GOLD;
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(0, cy, 32, 40, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = color;
    g.font = `bold 58px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(rank, 0, cy + 9);
    // Krone (König: fünf Zacken, Dame: drei, Bube: Feder)
    g.fillStyle = GOLD;
    g.strokeStyle = 'rgba(90,60,10,0.8)';
    g.lineWidth = 0.8;
    g.beginPath();
    if (rank === 'J') {
      g.moveTo(-3, cy - 20);
      g.quadraticCurveTo(-16, cy - 34, 2, cy - 43);
      g.quadraticCurveTo(12, cy - 32, 3, cy - 20);
    } else {
      const spikes = rank === 'K' ? 5 : 3, half = 17;
      g.moveTo(-half, cy - 21);
      for (let i = 0; i < spikes; i++) {
        const xa = -half + (i / spikes) * half * 2, xb = -half + ((i + 1) / spikes) * half * 2;
        g.lineTo((xa + xb) / 2, cy - 38 - (i === Math.floor(spikes / 2) ? 4 : 0));
        g.lineTo(xb, cy - 27);
      }
      g.lineTo(half, cy - 21);
    }
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = color;
    drawSuit(g, suit, -fw / 2 + 17, -fh / 2 + 20, 24);
    g.restore();
  }
  g.restore();
  g.strokeStyle = color;
  g.lineWidth = 2.2;
  g.strokeRect(x0, y0, fw, fh);
  g.strokeStyle = GOLD;
  g.lineWidth = 1;
  g.strokeRect(x0 + 4, y0 + 4, fw - 8, fh - 8);
}

function drawFace(rank, suit) {
  return (g, W, H) => {
    g.scale(W / 256, H / 358);
    const w = 256, h = 358;
    const color = suit === 'heart' || suit === 'diamond' ? RED : BLACK;
    drawPaper(g, w, h);
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    // Eckindizes oben links und (gedreht) unten rechts
    for (const turn of [0, Math.PI]) {
      g.save();
      g.translate(w / 2, h / 2);
      g.rotate(turn);
      g.translate(-w / 2, -h / 2);
      g.font = `bold ${rank === '10' ? 37 : 43}px ${SERIF}`;
      if (rank === '10') {
        g.save();
        g.translate(27, 40);
        g.scale(0.82, 1);
        g.fillText('10', 0, 0);
        g.restore();
      } else {
        g.fillText(rank, 27, 40);
      }
      drawSuit(g, suit, 27, 81, 27);
      g.restore();
    }

    if (rank === 'A') {
      drawSuit(g, suit, w / 2, h / 2, suit === 'spade' ? 150 : 118);
      if (suit === 'spade') {
        g.fillStyle = '#f8f5ea';
        drawSuit(g, 'spade', w / 2, h / 2 - 4, 58);
        g.fillStyle = color;
        drawSuit(g, 'spade', w / 2, h / 2 - 4, 30);
      }
    } else if (PIPS[rank]) {
      for (const [x, y] of PIPS[rank]) drawSuit(g, suit, x * w, y * h, 50, y > 0.5);
    } else {
      drawCourt(g, w, h, rank, suit, color);
    }
    drawCardWear(g, w, h);
  };
}

function drawBack(g, W, H) {
  g.scale(W / 256, H / 358);
  const w = 256, h = 358, m = 14;
  drawPaper(g, w, h);
  g.fillStyle = '#8e1220';
  g.fillRect(m, m, w - 2 * m, h - 2 * m);
  g.save();
  g.beginPath();
  g.rect(m, m, w - 2 * m, h - 2 * m);
  g.clip();
  // feines Rautengitter
  g.strokeStyle = 'rgba(255,240,225,0.45)';
  g.lineWidth = 1.1;
  for (let d = -h; d < w + h; d += 11) {
    g.beginPath();
    g.moveTo(d, 0);
    g.lineTo(d + h, h);
    g.moveTo(d, 0);
    g.lineTo(d - h, h);
    g.stroke();
  }
  // Mittelornament
  g.translate(w / 2, h / 2);
  g.fillStyle = '#8e1220';
  g.strokeStyle = 'rgba(255,240,225,0.85)';
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(0, 0, 50, 68, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    g.rotate(Math.PI / 6);
    g.beginPath();
    g.ellipse(0, -30, 9, 26, 0, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,240,225,0.9)';
  drawSuit(g, 'diamond', 0, 0, 22);
  g.restore();
  g.strokeStyle = 'rgba(255,240,225,0.8)';
  g.lineWidth = 2.2;
  g.strokeRect(m + 6, m + 6, w - 2 * m - 12, h - 2 * m - 12);
  g.lineWidth = 0.8;
  g.strokeRect(m + 10, m + 10, w - 2 * m - 20, h - 2 * m - 20);
  // abgegriffene Farbe: helle Stellen an Rand und Ecken, feine Kratzer
  for (let i = 0; i < 160; i++) {
    const side = Math.floor(Math.random() * 4), along = Math.random();
    const depth = m + Math.random() * Math.random() * 16;
    const x = side < 2 ? along * w : side === 2 ? depth : w - depth;
    const y = side < 2 ? (side === 0 ? depth : h - depth) : along * h;
    g.fillStyle = `rgba(248,240,225,${0.25 + Math.random() * 0.45})`;
    g.fillRect(x, y, 0.8 + Math.random() * 2.2, 0.8 + Math.random() * 1.6);
  }
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI, len = 15 + Math.random() * 70;
    g.strokeStyle = `rgba(255,245,230,${0.08 + Math.random() * 0.12})`;
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  drawCardWear(g, w, h, 0.7);
}

// Leinenprägung (Höhenkarte) und ungleichmäßiger Glanz durch Fingerabdrücke
function drawLinen(g, w, h) {
  g.fillStyle = '#808080';
  g.fillRect(0, 0, w, h);
  g.lineWidth = 1;
  for (let i = 0; i < w; i += 4) {
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.moveTo(i, 0); g.lineTo(i, h);
    g.moveTo(0, i); g.lineTo(w, i);
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.moveTo(i + 2, 0); g.lineTo(i + 2, h);
    g.moveTo(0, i + 2); g.lineTo(w, i + 2);
    g.stroke();
  }
}

function drawSmudges(g, w, h) {
  g.fillStyle = 'rgb(170,170,170)';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = w * (0.08 + Math.random() * 0.2);
    const v = Math.random() < 0.6 ? 255 : 70;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${v},${v},${v},${0.2 + Math.random() * 0.3})`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
}

// --- Chipbilder -----------------------------------------------------------------

const CHIPS = {
  white: { base: '#ddd8c9', insert: '#1f3f8f', text: '#1f3f8f', value: '1' },
  red: { base: '#a81c26', insert: '#efe9da', text: '#a81c26', value: '5' },
  blue: { base: '#1c3f93', insert: '#efe9da', text: '#1c3f93', value: '10' },
  green: { base: '#1b6b3e', insert: '#efe9da', text: '#1b6b3e', value: '25' },
  black: { base: '#1b1b1f', insert: '#efe9da', text: '#1b1b1f', value: '100' },
};

function speckle(g, w, h, count, alpha) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }
}

function drawChipTop(def) {
  return (g, w) => {
    const c = w / 2, R = w / 2;
    g.fillStyle = def.base;
    g.fillRect(0, 0, w, w);
    speckle(g, w, w, 1800, 0.09);
    // sechs Randeinsätze, deckungsgleich mit den Streifen auf der Kante
    g.fillStyle = def.insert;
    for (let k = 0; k < 6; k++) {
      const a = (k * Math.PI) / 3, half = 0.2;
      g.beginPath();
      g.arc(c, c, R, a - half, a + half);
      g.arc(c, c, R * 0.77, a + half, a - half, true);
      g.closePath();
      g.fill();
    }
    // geprägte Ringe
    g.strokeStyle = 'rgba(0,0,0,0.38)';
    g.lineWidth = w * 0.012;
    g.beginPath();
    g.arc(c, c, R * 0.76, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.16)';
    g.lineWidth = w * 0.008;
    g.beginPath();
    g.arc(c, c, R * 0.735, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([w * 0.016, w * 0.03]);
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = w * 0.016;
    g.beginPath();
    g.arc(c, c, R * 0.655, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    // Inlay mit Wert
    g.fillStyle = '#efe9da';
    g.beginPath();
    g.arc(c, c, R * 0.55, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = def.text;
    g.lineWidth = w * 0.014;
    g.beginPath();
    g.arc(c, c, R * 0.47, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = def.text;
    g.font = `bold ${w * (def.value.length > 2 ? 0.22 : 0.3)}px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(def.value, c, c + w * 0.015);
    // Gebrauchsspuren: Schmutz am Inlay-Rand, Kratzer, abgestoßene Kante
    const grime = g.createRadialGradient(c, c, R * 0.3, c, c, R * 0.57);
    grime.addColorStop(0, 'rgba(80,60,30,0)');
    grime.addColorStop(1, 'rgba(80,60,30,0.2)');
    g.fillStyle = grime;
    g.beginPath();
    g.arc(c, c, R * 0.55, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, r = R * (0.2 + Math.random() * 0.75), len = 0.15 + Math.random() * 0.5;
      g.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.1})`;
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(c + rnd(6), c + rnd(6), r, a, a + len);
      g.stroke();
    }
    const rim = g.createRadialGradient(c, c, R * 0.9, c, c, R);
    rim.addColorStop(0, 'rgba(255,255,255,0)');
    rim.addColorStop(0.7, 'rgba(255,255,255,0.12)');
    rim.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = rim;
    g.fillRect(0, 0, w, w);
  };
}

function drawChipSide(def) {
  return (g, w, h) => {
    g.fillStyle = def.base;
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, 0.1);
    g.fillStyle = def.insert;
    const half = (0.2 / (Math.PI * 2)) * w;
    for (let k = 0; k <= 6; k++) g.fillRect((k / 6) * w - half, 0, half * 2, h);
    // gerundete Kanten: oben und unten abgedunkelt, in der Mitte ein Glanzstreifen
    const shade = g.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(0,0,0,0.55)');
    shade.addColorStop(0.22, 'rgba(0,0,0,0)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0.1)');
    shade.addColorStop(0.78, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = shade;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.2})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 1);
    }
  };
}

// --- Geometrie ------------------------------------------------------------------

function cardShape() {
  const w = CARD_W / 2, h = CARD_H / 2, r = 0.13;
  const s = new THREE.Shape();
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  return s;
}

function cardFaceGeometry() {
  const geo = new THREE.ShapeGeometry(cardShape(), 5);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5);
  }
  return geo;
}

const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => t * t * (3 - 2 * t);

// --- Aufbau ---------------------------------------------------------------------

export function createPoker({ scene, material, canvasTexture, lite, center }) {
  const solid = (mesh) => {
    mesh.castShadow = !lite;
    mesh.receiveShadow = !lite;
    mesh.layers.enable(1); // für die Kontaktschatten-Kamera
    return mesh;
  };
  const res = lite ? 1 : 2; // Texturauflösung

  // Sitzplätze auf einer Ellipse um die Tischmitte; Winkel 90° = vor dem Bildschirm.
  const SEATS = [90, 150, 210, 270, 330, 30].map((deg, i) => {
    const a = (deg * Math.PI) / 180;
    return {
      x: center.x + 11 * Math.cos(a),
      z: center.z + 7 * Math.sin(a),
      heading: a - Math.PI / 2,
      radial: [Math.cos(a), Math.sin(a)],
      tangent: [-Math.sin(a), Math.cos(a)],
      open: i === 0,
    };
  });
  const BOARD = { z: center.z - 0.6, gap: 0.24 };
  const DECK = { x: center.x + 8.7, z: center.z + 0.9, heading: -1.0, height: 0.38 };

  // --- Karten ---
  const frontGeo = cardFaceGeometry().rotateX(-Math.PI / 2);
  const backGeo = cardFaceGeometry().rotateX(Math.PI / 2);
  const coreGeo = new THREE.ExtrudeGeometry(cardShape(), { depth: THICK, bevelEnabled: false, curveSegments: 5 })
    .translate(0, 0, -THICK / 2).rotateX(-Math.PI / 2);
  const coreMat = material({ color: 0xe6e0cf, roughness: 0.9 });
  const cardSurface = lite ? { roughness: 0.55 } : {
    roughness: 0.75,
    roughnessMap: canvasTexture(256, 256, drawSmudges, 1, 1, false),
    bumpMap: canvasTexture(128, 128, drawLinen, 9, 12.6, false),
    bumpScale: 0.25,
  };
  const cardCoat = { clearcoat: 0.18, clearcoatRoughness: 0.5, envMapIntensity: 0.9 };
  const TEX_W = 256 * res, TEX_H = 358 * res;
  const backTextures = Array.from({ length: lite ? 1 : 4 }, () => canvasTexture(TEX_W, TEX_H, drawBack, 1, 1));
  const faceTextures = new Map();
  const faceTexture = (id) => {
    if (!faceTextures.has(id)) {
      faceTextures.set(id, canvasTexture(TEX_W, TEX_H, drawFace(RANKS[id % 13], SUITS[Math.floor(id / 13)]), 1, 1));
    }
    return faceTextures.get(id);
  };

  const cards = [];
  for (let i = 0; i < SEATS.length * 2 + 5; i++) {
    const group = new THREE.Group();
    group.rotation.order = 'YZX'; // erst umdrehen (z), dann ausrichten (y)
    // jede Karte ist etwas anders vergilbt
    const tone = new THREE.Color().setHSL(0.11, 0.25, 0.93 + Math.random() * 0.07);
    const frontMat = material({ ...cardSurface, color: tone }, cardCoat);
    const backMat = material({ ...cardSurface, color: tone, map: pick(backTextures) }, cardCoat);
    const front = solid(new THREE.Mesh(frontGeo, frontMat));
    front.position.y = THICK / 2 + 0.0008;
    const back = solid(new THREE.Mesh(backGeo, backMat));
    back.position.y = -THICK / 2 - 0.0008;
    group.add(front, back, solid(new THREE.Mesh(coreGeo, coreMat)));
    scene.add(group);
    // Zustand: x, y, z, heading, flip (PI = verdeckt)
    const inDeck = {
      x: DECK.x, y: DECK.height + THICK + i * 0.004, z: DECK.z, heading: DECK.heading, flip: Math.PI,
    };
    cards.push({ group, frontMat, inDeck, now: { ...inDeck } });
  }
  const place = (card, s) => {
    card.group.position.set(s.x, s.y, s.z);
    card.group.rotation.set(0, s.heading, s.flip);
  };
  cards.forEach((c) => place(c, c.now));

  // --- Kartenstapel: einzelne, leicht verrutschte Lagen ---
  {
    const layers = 16, layerH = DECK.height / layers;
    const geo = new THREE.ExtrudeGeometry(cardShape(), { depth: layerH, bevelEnabled: false, curveSegments: 5 })
      .rotateX(-Math.PI / 2);
    const edges = [0xe9e4d4, 0xdcd6c4, 0xe3decd].map((color) => material({ color, roughness: 0.9 }));
    for (let i = 0; i < layers; i++) {
      const layer = solid(new THREE.Mesh(geo, edges[i % edges.length]));
      layer.position.set(DECK.x + rnd(0.02), i * layerH, DECK.z + rnd(0.02));
      layer.rotation.y = DECK.heading + rnd(0.012);
      scene.add(layer);
    }
    const top = solid(new THREE.Mesh(frontGeo, material({ ...cardSurface, map: backTextures[0] }, cardCoat)));
    top.position.set(DECK.x, DECK.height + 0.002, DECK.z);
    top.rotation.y = DECK.heading;
    scene.add(top);
  }

  // --- Dealer-Button ---
  {
    const top = material({
      roughness: 0.35,
      map: canvasTexture(256, 256, (g, w) => {
        g.fillStyle = '#f3f0e6';
        g.fillRect(0, 0, w, w);
        speckle(g, w, w, 900, 0.04);
        g.strokeStyle = '#1d1d22';
        g.lineWidth = 7;
        g.beginPath();
        g.arc(w / 2, w / 2, w * 0.41, 0, Math.PI * 2);
        g.stroke();
        g.lineWidth = 2;
        g.beginPath();
        g.arc(w / 2, w / 2, w * 0.36, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#1d1d22';
        g.font = 'bold 50px Arial, Helvetica, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText('DEALER', w / 2, w / 2 + 3);
        for (let i = 0; i < 12; i++) {
          g.strokeStyle = `rgba(60,50,30,${0.05 + Math.random() * 0.08})`;
          g.lineWidth = 0.8;
          g.beginPath();
          g.arc(w / 2 + rnd(30), w / 2 + rnd(30), 30 + Math.random() * 80, Math.random() * 6, Math.random() * 6 + 0.6);
          g.stroke();
        }
      }, 1, 1),
    }, { clearcoat: 0.7, clearcoatRoughness: 0.25 });
    const side = material({ color: 0xece8dc, roughness: 0.4 }, { clearcoat: 0.5, clearcoatRoughness: 0.3 });
    const button = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.2, 48), [side, top, side]));
    button.position.set(center.x + 6.5, 0.1, center.z + 4.4);
    button.rotation.y = 0.5;
    scene.add(button);
  }

  // --- Chips: jeder Chip einzeln, leicht verdreht, versetzt und unterschiedlich abgenutzt ---
  {
    const chips = Object.fromEntries(Object.keys(CHIPS).map((name) => [name, []]));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const addChip = (name, x, y, z, tilt = 0, tiltDir = 0) => {
      e.set(tilt, Math.random() * Math.PI * 2, 0, 'YXZ');
      q.setFromEuler(e);
      if (tilt) q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), tiltDir));
      chips[name].push({ matrix: m.clone().compose(new THREE.Vector3(x, y, z), q, one), shade: 0.82 + Math.random() * 0.18 });
    };
    const stack = (name, x, z, count) => {
      const leanX = rnd(0.012), leanZ = rnd(0.012);
      for (let i = 0; i < count; i++) {
        addChip(name, x + leanX * i + rnd(0.028), CHIP_H / 2 + i * CHIP_H, z + leanZ * i + rnd(0.028));
      }
    };
    const names = Object.keys(CHIPS);

    // Pot: unordentliche kleine Stapel und einzelne Chips vor den Gemeinschaftskarten
    const potZ = center.z + 2.3;
    stack('red', center.x - 2.7, potZ + 0.2, 4);
    stack('green', center.x - 1.1, potZ - 0.3, 3);
    stack('black', center.x + 0.5, potZ + 0.3, 2);
    stack('red', center.x + 2.2, potZ - 0.2, 5);
    stack('blue', center.x + 3.6, potZ + 0.5, 2);
    for (const [name, dx, dz] of [['white', -3.9, 0.9], ['blue', -1.9, 1.5], ['white', 1.3, 1.6], ['green', 3.0, 1.9]]) {
      addChip(name, center.x + dx, CHIP_H / 2, potZ + dz);
    }
    // zwei Chips, die schräg auf einem anderen liegen
    for (const [name, dx, dz, dir] of [['red', -0.6, 1.5, 0.6], ['black', 4.6, 1.6, 2.4]]) {
      const x = center.x + dx, z = potZ + dz, off = CHIP_R * 1.15;
      addChip(pick(names), x, CHIP_H / 2, z);
      addChip(name, x + Math.sin(dir) * off, 0.145, z + Math.cos(dir) * off, 0.13, dir);
    }
    // Stapel vor jedem Spieler
    for (const seat of SEATS) {
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const along = 2.6 + k * (CHIP_R * 2 + 0.14), out = 0.5 + rnd(0.25);
        stack(pick(names),
          seat.x + seat.tangent[0] * along + seat.radial[0] * out,
          seat.z + seat.tangent[1] * along + seat.radial[1] * out,
          3 + Math.floor(Math.random() * 8));
      }
    }

    const geo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, 48, 1);
    const color = new THREE.Color();
    for (const [name, list] of Object.entries(chips)) {
      if (!list.length) continue;
      const def = CHIPS[name];
      const top = material({ roughness: 0.72, map: canvasTexture(128 * res, 128 * res, drawChipTop(def), 1, 1) });
      const side = material({ roughness: 0.68, map: canvasTexture(384, 32, drawChipSide(def), 1, 1) });
      const mesh = solid(new THREE.InstancedMesh(geo, [side, top, top], list.length));
      list.forEach((chip, i) => {
        mesh.setMatrixAt(i, chip.matrix);
        mesh.setColorAt(i, color.setScalar(chip.shade));
      });
      scene.add(mesh);
    }
  }

  // --- Animation: Zeitleiste aus Kartenbewegungen und Ereignissen ---------------

  let tweens = [];   // { card, start, dur, from, to, arc, ease }
  let events = [];   // { time, run }
  let clock = 0;     // Startzeit der laufenden Zeitleiste (ms)

  // Bewegung anhängen; "from" ist der Zustand, den die Karte bis dahin erreicht hat.
  function move(card, start, dur, to, { arc = 0, ease = easeOut } = {}) {
    const from = card.plan ?? { ...card.now };
    const target = { ...from, ...to };
    tweens.push({ card, start, dur, from, to: target, arc, ease });
    card.plan = target;
    return start + dur;
  }

  function deal(now) {
    tweens = [];
    events = [];
    clock = now;
    cards.forEach((c) => { c.plan = null; });
    let t = 0;

    // liegen schon Karten aus, zuerst alles zurück zum Stapel
    if (cards.some((c) => c.now.x !== c.inDeck.x || c.now.z !== c.inDeck.z)) {
      cards.forEach((c, i) => move(c, i * 22, 380, c.inDeck, { arc: 0.5 }));
      t = 380 + cards.length * 22 + 250;
    }

    // neu mischen: Kartenwerte zuweisen, solange alles verdeckt im Stapel liegt
    events.push({
      time: t,
      run: () => {
        const ids = Array.from({ length: 52 }, (_, i) => i);
        for (let i = 51; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        cards.forEach((c, i) => {
          c.frontMat.map = faceTexture(ids[i]);
          c.frontMat.needsUpdate = true;
        });
      },
    });
    t += 350;

    // zwei Runden Pocket Cards reihum, jede Karte dreht sich im Flug einmal
    const pockets = cards.slice(0, SEATS.length * 2);
    const board = cards.slice(SEATS.length * 2);
    for (let round = 0; round < 2; round++) {
      SEATS.forEach((seat, s) => {
        const side = round === 0 ? -1 : 1;
        const spread = seat.open ? 1.0 : 0.42;
        const heading = seat.heading + side * (seat.open ? 0.07 : 0.12) + rnd(0.03);
        move(pockets[round * SEATS.length + s], t, 480, {
          x: seat.x + Math.cos(seat.heading) * side * spread + rnd(0.05),
          z: seat.z - Math.sin(seat.heading) * side * spread + rnd(0.05),
          y: 0.012 + round * 0.016,
          heading: heading + Math.PI * 2,
        }, { arc: 0.7 });
        t += 150;
      });
    }
    t += 500;

    // der Spieler vor dem Bildschirm deckt seine Karten auf
    SEATS.forEach((seat, s) => {
      if (!seat.open) return;
      for (let round = 0; round < 2; round++) {
        move(pockets[round * SEATS.length + s], t + round * 160, 420, { flip: 0 }, { arc: 1.25, ease: easeInOut });
      }
    });
    t += 1000;

    // Flop, Turn, River: verdeckt in die Mitte schieben, dann aufdecken
    const step = CARD_W + BOARD.gap;
    const toBoard = (i, at) => move(board[i], at, 520, {
      x: center.x + (i - 2) * step + rnd(0.04), z: BOARD.z + rnd(0.05), y: 0.012, heading: rnd(0.04),
    }, { arc: 0.6 });
    const reveal = (i, at) => move(board[i], at, 440, { flip: 0 }, { arc: 1.25, ease: easeInOut });
    let landed = t;
    for (let i = 0; i < 3; i++) landed = toBoard(i, t + i * 170);
    for (let i = 0; i < 3; i++) t = reveal(i, landed + 250 + i * 190);
    for (const i of [3, 4]) {
      t = reveal(i, toBoard(i, t + 900) + 250);
    }
  }

  // Liefert true, solange sich etwas bewegt (dann muss neu gezeichnet werden).
  function update(now) {
    if (!tweens.length && !events.length) return false;
    const time = now - clock;
    events = events.filter((ev) => {
      if (ev.time > time) return true;
      ev.run();
      return false;
    });
    tweens = tweens.filter((tw) => {
      if (time < tw.start) return true;
      const raw = Math.min(1, (time - tw.start) / tw.dur);
      const k = tw.ease(raw);
      const s = tw.card.now;
      for (const key of ['x', 'y', 'z', 'heading', 'flip']) s[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * k;
      place(tw.card, { ...s, y: s.y + tw.arc * Math.sin(Math.PI * raw) });
      if (raw < 1) return true;
      s.heading %= Math.PI * 2;
      return false;
    });
    return true;
  }

  return { deal, update };
}
