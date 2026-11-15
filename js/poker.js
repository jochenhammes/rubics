// Poker-Variante: der 3D-Tisch für Texas Hold'em (ohne Würfel).
// Zeigt den Spielzustand der Poker-Engine: Karten, Chips, Dealer-Button und
// Beschriftungen folgen jedem Zustand, Karten werden animiert gegeben und gedreht.

import * as THREE from '../vendor/three.module.min.js';

// Maße relativ zur Kartenbreite (echte Pokerkarte 63 × 88 mm, Chip 39 × 3,3 mm)
const CARD_W = 2.2, CARD_H = 3.08, THICK = 0.012;
const CHIP_R = 0.68, CHIP_H = 0.115;
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

// Chipwerte eines Turniers (alle Beträge der Engine sind Vielfache von 5)
const DENOMS = [
  { value: 5, base: '#a81c26', insert: '#efe9da', text: '#a81c26' },
  { value: 25, base: '#1b6b3e', insert: '#efe9da', text: '#1b6b3e' },
  { value: 100, base: '#1b1b1f', insert: '#efe9da', text: '#1b1b1f' },
  { value: 500, base: '#55287f', insert: '#efe9da', text: '#55287f' },
  { value: 1000, base: '#c39618', insert: '#2b2416', text: '#6b4f08' },
  { value: 5000, base: '#bd5716', insert: '#efe9da', text: '#8a3c0b' },
];

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
    const text = String(def.value);
    g.font = `bold ${w * (text.length > 3 ? 0.19 : text.length > 2 ? 0.23 : 0.3)}px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, c, c + w * 0.015);
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

const DEG = Math.PI / 180;
// Acht Plätze im Uhrzeigersinn, Platz 0 sitzt vor dem Bildschirm (90°).
const LAYOUTS = {
  landscape: { rx: 12.5, rz: 6.2, angles: [90, 135, 180, 225, 270, 315, 0, 45], deck: [7.8, -0.6, -Math.PI / 2], potZ: 1.9 },
  portrait: { rx: 5.6, rz: 10, angles: [90, 130, 158, 202, 270, 338, 22, 50], deck: [0, -3.5, Math.PI / 2], potZ: 1.7 },
};
// Welche der acht Plätze bei n Spielern besetzt werden
const SLOTS = {
  2: [0, 4], 3: [0, 3, 5], 4: [0, 2, 4, 6], 5: [0, 2, 3, 5, 6],
  6: [0, 1, 3, 4, 5, 7], 7: [0, 1, 2, 3, 5, 6, 7], 8: [0, 1, 2, 3, 4, 5, 6, 7],
};
const SUIT_NAMES = ['club', 'diamond', 'heart', 'spade'];       // Reihenfolge der Engine
const RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const ACTION_TEXT = { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in' };
const money = (n) => n.toLocaleString('de-DE');

// stabiler Pseudozufall, damit Chips beim Neuaufbau nicht springen
const hash = (a, b, c) => {
  const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

// Betrag in Chips zerlegen: große Werte zuerst, aber immer etwas Wechselgeld lassen
function chipsFor(amount) {
  const counts = DENOMS.map(() => 0);
  let rest = amount;
  let top = DENOMS.length - 1;
  while (top > 0 && DENOMS[top].value > amount / 2) top--;
  for (let i = top; i >= 0; i--) {
    let n = Math.floor(rest / DENOMS[i].value);
    if (i > 0) n = Math.max(0, n - 2);
    counts[i] = n;
    rest -= n * DENOMS[i].value;
  }
  return counts;
}

export function createPoker({ scene, material, canvasTexture, lite, center, labels }) {
  const solid = (mesh) => {
    mesh.castShadow = !lite;
    mesh.receiveShadow = !lite;
    mesh.layers.enable(1); // für die Kontaktschatten-Kamera
    return mesh;
  };
  const res = lite ? 1 : 2; // Texturauflösung
  let layout = LAYOUTS.landscape;
  const deckPos = () => ({ x: center.x + layout.deck[0], z: center.z + layout.deck[1], heading: layout.deck[2] });
  const DECK_H = 0.38;

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
  const faceTexture = (card) => {
    if (!faceTextures.has(card)) {
      faceTextures.set(card, canvasTexture(TEX_W, TEX_H, drawFace(RANK_LABELS[card >> 2], SUIT_NAMES[card & 3]), 1, 1));
    }
    return faceTextures.get(card);
  };

  const cards = new Map(); // Schlüssel -> Karte
  function getCard(key) {
    if (cards.has(key)) return cards.get(key);
    const group = new THREE.Group();
    group.rotation.order = 'YZX'; // erst umdrehen (z), dann ausrichten (y)
    group.visible = false;
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
    const d = deckPos();
    // Zustand: x, y, z, heading, flip (PI = verdeckt)
    const card = {
      group, frontMat, value: null, place: 'deck', sig: '', queue: [],
      now: { x: d.x, y: DECK_H + 0.03, z: d.z, heading: d.heading, flip: Math.PI },
    };
    cards.set(key, card);
    return card;
  }
  const show = (card, s) => {
    card.group.position.set(s.x, s.y, s.z);
    card.group.rotation.set(0, s.heading, s.flip);
  };

  // --- Kartenstapel: einzelne, leicht verrutschte Lagen ---
  const deck = new THREE.Group();
  {
    const layers = 16, layerH = DECK_H / layers;
    const geo = new THREE.ExtrudeGeometry(cardShape(), { depth: layerH, bevelEnabled: false, curveSegments: 5 })
      .rotateX(-Math.PI / 2);
    const edges = [0xe9e4d4, 0xdcd6c4, 0xe3decd].map((color) => material({ color, roughness: 0.9 }));
    for (let i = 0; i < layers; i++) {
      const layer = solid(new THREE.Mesh(geo, edges[i % edges.length]));
      layer.position.set(rnd(0.02), i * layerH, rnd(0.02));
      layer.rotation.y = rnd(0.012);
      deck.add(layer);
    }
    const top = solid(new THREE.Mesh(frontGeo, material({ ...cardSurface, map: backTextures[0] }, cardCoat)));
    top.position.y = DECK_H + 0.002;
    deck.add(top);
    scene.add(deck);
  }

  // --- Dealer-Button ---
  const button = (() => {
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
      }, 1, 1),
    }, { clearcoat: 0.7, clearcoatRoughness: 0.25 });
    const side = material({ color: 0xece8dc, roughness: 0.4 }, { clearcoat: 0.5, clearcoatRoughness: 0.3 });
    const mesh = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.2, 48), [side, top, side]));
    mesh.position.set(center.x, 0.1, center.z + 3);
    mesh.rotation.y = 0.5;
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, target: null };
  })();

  // --- Chips: je Wert ein instanziertes Netz, das pro Spielzustand neu belegt wird ---
  const CAPACITY = 420;
  const chipGeo = new THREE.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, lite ? 24 : 48, 1);
  const chipMeshes = DENOMS.map((def) => {
    const top = material({ roughness: 0.72, map: canvasTexture(128 * res, 128 * res, drawChipTop(def), 1, 1) });
    const side = material({ roughness: 0.68, map: canvasTexture(384, 32, drawChipSide(def), 1, 1) });
    const mesh = solid(new THREE.InstancedMesh(chipGeo, [side, top, top], CAPACITY));
    const shade = new THREE.Color();
    for (let i = 0; i < CAPACITY; i++) mesh.setColorAt(i, shade.setScalar(0.82 + Math.random() * 0.18));
    mesh.count = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  });
  const chipM = new THREE.Matrix4(), chipQ = new THREE.Quaternion(), chipP = new THREE.Vector3();
  const ONE = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  let chipSig = '';

  // piles: [{ id, amount, x, z, ax:[x,z], ay:[x,z] }] – ax/ay spannen das Raster der Stapel auf
  function layoutChips(piles) {
    const used = DENOMS.map(() => 0);
    for (const pile of piles) {
      const counts = chipsFor(pile.amount);
      const columns = [];
      for (let d = DENOMS.length - 1; d >= 0; d--) {
        for (let left = counts[d]; left > 0; left -= 14) columns.push([d, Math.min(14, left)]);
      }
      const perRow = pile.perRow ?? 4, pitch = CHIP_R * 2 + 0.1;
      columns.forEach(([d, n], c) => {
        const row = Math.floor(c / perRow), inRow = Math.min(perRow, columns.length - row * perRow);
        const u = ((c % perRow) - (inRow - 1) / 2) * pitch + (hash(pile.id, c, 1) - 0.5) * 0.08;
        const v = row * pitch + (hash(pile.id, c, 2) - 0.5) * 0.08;
        const bx = pile.x + pile.ax[0] * u + pile.ay[0] * v, bz = pile.z + pile.ax[1] * u + pile.ay[1] * v;
        const leanX = (hash(pile.id, c, 3) - 0.5) * 0.02, leanZ = (hash(pile.id, c, 4) - 0.5) * 0.02;
        for (let i = 0; i < n && used[d] < CAPACITY; i++) {
          chipP.set(
            bx + leanX * i + (hash(pile.id, c, 10 + i) - 0.5) * 0.05,
            CHIP_H / 2 + i * CHIP_H,
            bz + leanZ * i + (hash(pile.id, c, 40 + i) - 0.5) * 0.05,
          );
          chipQ.setFromAxisAngle(UP, hash(pile.id, c, 70 + i) * Math.PI * 2);
          chipMeshes[d].setMatrixAt(used[d]++, chipM.compose(chipP, chipQ, ONE));
        }
      });
    }
    chipMeshes.forEach((mesh, d) => {
      mesh.count = used[d];
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  // --- Beschriftungen (HTML über der Szene) ---
  const labelEls = new Map(); // id -> { el, anchor:[x,y,z] }
  function label(id, cls) {
    if (!labelEls.has(id)) {
      const el = document.createElement('div');
      el.className = cls;
      labels.appendChild(el);
      labelEls.set(id, { el, anchor: [0, 0, 0], seen: true });
    }
    const entry = labelEls.get(id);
    entry.seen = true;
    return entry;
  }

  // --- Spielzustand übernehmen ----------------------------------------------------

  let tableSig = '';
  let seats = new Map(); // Spieler-ID -> Geometrie des Platzes
  let animating = false;

  function seatGeometry(view) {
    const n = view.players.length;
    const hero = Math.max(0, view.players.findIndex((p) => p.id === view.viewerId));
    const slots = SLOTS[Math.min(8, Math.max(2, n))];
    const map = new Map();
    view.players.forEach((p, i) => {
      const a = layout.angles[slots[(i - hero + n) % n]] * DEG;
      const radial = [Math.cos(a), Math.sin(a)], tangent = [-Math.sin(a), Math.cos(a)];
      map.set(p.id, {
        x: center.x + layout.rx * radial[0], z: center.z + layout.rz * radial[1],
        heading: a - Math.PI / 2, radial, tangent,
      });
    });
    return map;
  }

  // Bewegung(en) für eine Karte planen; ersetzt alles, was noch aussteht
  function plan(card, steps) {
    card.queue = steps;
    card.group.visible = true;
    animating = true;
  }

  function aim(card, goal, delay, now) {
    const sig = `${goal.place}|${goal.up}|${goal.x.toFixed(2)}|${goal.z.toFixed(2)}`;
    if (sig === card.sig) return;
    const wasPlace = card.place;
    card.sig = sig;
    card.place = goal.place;
    if (goal.value != null && goal.value !== card.value) {
      card.value = goal.value;
      card.frontMat.map = faceTexture(goal.value);
      card.frontMat.needsUpdate = true;
    }
    const at = now + delay;
    const flip = goal.up ? 0 : Math.PI;
    const pos = { x: goal.x, y: goal.y, z: goal.z, heading: goal.heading };
    if (goal.place === 'deck') {
      plan(card, [{ at, dur: 380, to: { ...pos, flip: Math.PI }, arc: 0.5, ease: easeOut, hide: true }]);
    } else if (wasPlace === 'deck') {
      // verdeckt austeilen (mit einer Drehung im Flug), danach ggf. aufdecken
      const steps = [{ at, dur: 480, to: { ...pos, flip: Math.PI }, arc: 0.7, ease: easeOut, spin: Math.PI * 2 }];
      if (goal.up) steps.push({ at: null, dur: 420, to: { ...pos, flip }, arc: 1.25, ease: easeInOut });
      plan(card, steps);
    } else {
      const turning = Math.abs(card.now.flip - flip) > 0.1;
      plan(card, [{ at, dur: 420, to: { ...pos, flip }, arc: turning ? 1.25 : 0.25, ease: easeInOut }]);
    }
  }

  function setSnapshot(snap, aspect) {
    const view = snap.view;
    const now = performance.now();
    const next = aspect < 0.9 ? LAYOUTS.portrait : LAYOUTS.landscape;
    const sig = view.players.map((p) => p.id).join(',') + (next === LAYOUTS.portrait ? 'p' : 'l');
    if (sig !== tableSig || next !== layout) {
      layout = next;
      tableSig = sig;
      seats = seatGeometry(view);
      chipSig = '';
    }
    const d = deckPos();
    deck.position.set(d.x, 0, d.z);
    deck.rotation.y = d.heading;
    const inDeck = { place: 'deck', up: false, x: d.x, y: DECK_H + 0.03, z: d.z, heading: d.heading, value: null };

    // Reihenfolge beim Geben: reihum ab dem Platz links vom Button
    const dealing = snap.events.some((e) => e.type === 'dealHole');
    const inHand = view.players.filter((p) => p.holeCards.length === 2 && !p.eliminated);
    const first = inHand.findIndex((p) => p.isSmallBlind);
    const dealOrder = new Map(inHand.map((p, i) => [p.id, (i - Math.max(0, first) + inHand.length) % inHand.length]));

    for (const p of view.players) {
      const seat = seats.get(p.id);
      for (let i = 0; i < 2; i++) {
        const card = getCard(`h${p.id}:${i}`);
        if (p.holeCards.length !== 2 || p.eliminated || p.folded) {
          aim(card, inDeck, 0, now);
          continue;
        }
        const value = p.holeCards[i], up = value != null;
        const side = i === 0 ? -1 : 1, spread = up ? 1.0 : 0.42;
        aim(card, {
          place: 'seat', up, value,
          x: seat.x + Math.cos(seat.heading) * side * spread,
          z: seat.z - Math.sin(seat.heading) * side * spread,
          y: 0.012 + i * 0.016,
          heading: seat.heading + side * (up ? 0.07 : 0.12),
        }, dealing ? (i * inHand.length + dealOrder.get(p.id)) * 110 : 0, now);
      }
    }
    const boardEvent = snap.events.find((e) => e.type === 'board');
    for (let i = 0; i < 5; i++) {
      const card = getCard(`b${i}`);
      const value = view.board[i];
      if (value == null) {
        aim(card, inDeck, 0, now);
        continue;
      }
      const fresh = boardEvent ? Math.max(0, boardEvent.cards.indexOf(value)) : 0;
      aim(card, {
        place: 'board', up: true, value,
        x: center.x + (i - 2) * (CARD_W + 0.24), z: center.z - 0.6, y: 0.012,
        heading: (hash(value, i, 5) - 0.5) * 0.06,
      }, fresh * 170, now);
    }

    // Dealer-Button
    const dealer = view.players.find((p) => p.isButton && !p.eliminated);
    if (dealer) {
      const s = seats.get(dealer.id);
      button.target = [
        s.x - s.radial[0] * 1.2 - s.tangent[0] * 2.7,
        s.z - s.radial[1] * 1.2 - s.tangent[1] * 2.7,
      ];
      if (!button.mesh.visible) {
        button.mesh.visible = true;
        button.mesh.position.set(button.target[0], 0.1, button.target[1]);
      }
      animating = true;
    }

    // Chips: Stacks hinter den Karten, Einsätze davor, Pot in der Mitte
    const piles = [];
    const potChips = view.pots.reduce((sum, pot) => sum + pot.amount, 0);
    view.players.forEach((p, i) => {
      if (p.eliminated) return;
      const s = seats.get(p.id);
      const grid = { ax: s.tangent, ay: s.radial };
      if (p.stack > 0) {
        piles.push({ id: i * 2 + 1, amount: p.stack, x: s.x + s.radial[0] * 3.0, z: s.z + s.radial[1] * 3.0, ...grid });
      }
      if (p.bet > 0) {
        piles.push({
          id: i * 2 + 2, amount: p.bet, perRow: 3,
          x: s.x - s.radial[0] * 2.3, z: s.z - s.radial[1] * 2.3, ax: s.tangent, ay: [-s.radial[0], -s.radial[1]],
        });
      }
    });
    if (potChips > 0) {
      piles.push({ id: 99, amount: potChips, perRow: 5, x: center.x, z: center.z + layout.potZ, ax: [1, 0], ay: [0, 1] });
    }
    const nextChipSig = piles.map((p) => `${p.id}:${p.amount}`).join(',');
    if (nextChipSig !== chipSig) {
      chipSig = nextChipSig;
      layoutChips(piles);
    }

    // Beschriftungen
    for (const entry of labelEls.values()) entry.seen = false;
    const winners = new Set((view.phase === 'handComplete' && view.lastResult
      ? view.lastResult.pots.flatMap((pot) => pot.winners.map((w) => w.playerId)) : []));
    for (const p of view.players) {
      const s = seats.get(p.id);
      const seat = label(`seat:${p.id}`, 'pk-seat');
      seat.anchor = [s.x + s.radial[0] * 4.5, 0.6, s.z + s.radial[1] * 4.5];
      const role = p.isButton ? 'D' : p.isSmallBlind ? 'SB' : p.isBigBlind ? 'BB' : '';
      const action = p.eliminated ? 'ausgeschieden'
        : snap.thinkingId === p.id ? '…'
        : p.allIn ? 'All-in'
        : p.lastAction ? ACTION_TEXT[p.lastAction.type] : '';
      seat.el.className = 'pk-seat'
        + (p.isToAct ? ' to-act' : '') + (p.folded ? ' folded' : '') + (p.eliminated ? ' out' : '')
        + (winners.has(p.id) ? ' winner' : '') + (p.id === view.viewerId ? ' hero' : '');
      seat.el.innerHTML = `<b>${escapeHtml(p.name)}${role ? `<i>${role}</i>` : ''}</b>`
        + `<span>${p.eliminated ? '–' : money(p.stack)}</span>${action ? `<em>${action}</em>` : ''}`;
      if (p.bet > 0 && !p.eliminated) {
        const bet = label(`bet:${p.id}`, 'pk-bet');
        bet.anchor = [s.x - s.radial[0] * 3.6, 0.3, s.z - s.radial[1] * 3.6];
        bet.el.textContent = money(p.bet);
      }
    }
    if (view.potTotal > 0) {
      const pot = label('pot', 'pk-pot');
      pot.anchor = [center.x, 0.5, center.z + layout.potZ + 1.6];
      pot.el.textContent = `Pot ${money(view.potTotal)}`;
    }
    for (const [id, entry] of labelEls) {
      if (entry.seen) continue;
      entry.el.remove();
      labelEls.delete(id);
    }
  }

  // Beschriftungen an die Bildschirmposition ihrer Anker setzen
  const projected = new THREE.Vector3();
  function layoutLabels(camera, w, h) {
    for (const { el, anchor } of labelEls.values()) {
      projected.set(anchor[0], anchor[1], anchor[2]).project(camera);
      const x = (projected.x + 1) / 2 * w, y = (1 - projected.y) / 2 * h;
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.visibility = projected.z < 1 ? 'visible' : 'hidden';
    }
  }

  // Liefert true, solange sich etwas bewegt (dann muss neu gezeichnet werden).
  function update(now) {
    if (!animating) return false;
    let active = false;
    for (const card of cards.values()) {
      const step = card.queue[0];
      if (!step) continue;
      active = true;
      if (step.at == null) step.at = now;
      if (now < step.at) continue;
      step.from ??= { ...card.now };
      const raw = Math.min(1, (now - step.at) / step.dur);
      const k = step.ease(raw), s = card.now;
      for (const key of ['x', 'y', 'z', 'flip']) s[key] = step.from[key] + (step.to[key] - step.from[key]) * k;
      s.heading = step.from.heading + (step.to.heading - step.from.heading + (step.spin ?? 0)) * k;
      show(card, { ...s, y: s.y + step.arc * Math.sin(Math.PI * raw) });
      if (raw >= 1) {
        s.heading = step.to.heading;
        if (step.hide) card.group.visible = false;
        card.queue.shift();
      }
    }
    if (button.target) {
      const p = button.mesh.position;
      const dx = button.target[0] - p.x, dz = button.target[1] - p.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.01) {
        p.x += dx * 0.14;
        p.z += dz * 0.14;
        active = true;
      }
    }
    animating = active;
    return true;
  }

  return { setSnapshot, update, layoutLabels };
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
