import test from 'node:test';
import assert from 'node:assert/strict';
import { solvedColors, applyMove, isSolved, inverseMove } from '../js/cube.js';
import { solve } from '../js/solver.js';

test('jeder Zug wird durch seinen Gegenzug aufgehoben', () => {
  for (let m = 0; m < 27; m++) {
    assert.ok(isSolved(applyMove(applyMove(solvedColors(), m), inverseMove(m))));
  }
});

test('gelöster Würfel braucht keine Züge', () => {
  assert.deepEqual(solve(solvedColors()), []);
});

test('Löser löst zufällige Stellungen (inkl. Mittelschicht-Zügen)', () => {
  for (let n = 0; n < 300; n++) {
    let colors = solvedColors();
    for (let i = 0; i < 30; i++) colors = applyMove(colors, Math.floor(Math.random() * 27));
    const steps = solve(colors);
    assert.ok(steps, 'Lösung gefunden');
    let stage = 0;
    for (const s of steps) {
      assert.ok(s.stage >= stage, 'Stufen in aufsteigender Reihenfolge');
      stage = s.stage;
      colors = applyMove(colors, s.move);
    }
    assert.ok(isSolved(colors));
  }
});
