import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTournament, makeTournamentConfig, advance, applyAction, toView, decideWithFallback, makeProfile, totalChips,
} from '../vendor/texasholdem/holdem.js';

test('gebündelte Poker-Engine spielt ein Turnier mit Computergegnern zu Ende', () => {
  const entrants = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), kind: 'bot' }));
  const state = createTournament(makeTournamentConfig(1500, 'turbo'), entrants, 42);
  const chips = totalChips(state);
  const profile = makeProfile('easy', 'tag');
  let steps = 0;
  while (state.phase !== 'tournamentComplete') {
    assert.ok(++steps < 200000, 'Turnier endet');
    if (state.phase === 'betting') {
      const player = state.players[state.toAct];
      const action = decideWithFallback({ view: toView(state, player.id), profile, history: [], seed: steps });
      applyAction(state, player.id, action);
    } else {
      advance(state);
    }
  }
  assert.equal(totalChips(state), chips, 'keine Chips verloren oder erfunden');
  assert.equal(state.placements.length, entrants.length);
  assert.equal(state.players.filter((p) => !p.eliminated).length, 1);
});
