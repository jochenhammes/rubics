// Poker-Variante: Turniersteuerung und Bedienelemente.
// Verbindet die Poker-Engine (vendor/texasholdem, aus dem Repository
// jochenhammes/texasholdem) mit dem 3D-Tisch aus poker.js.

import {
  LocalGameController, newGame, HERO_ID, storage, snapRaiseTo, STARTING_STACKS,
} from '../vendor/texasholdem/holdem.js';

const money = (n) => n.toLocaleString('de-DE');
const CATEGORY = {
  highCard: 'High Card', pair: 'einem Paar', twoPair: 'zwei Paaren', trips: 'einem Drilling',
  straight: 'einer Straße', flush: 'einem Flush', fullHouse: 'einem Full House', quads: 'einem Vierling',
  straightFlush: 'einem Straight Flush',
};
const DEFAULT_SETUP = { playerName: 'Du', totalPlayers: 6, difficulty: 'medium', startingStack: 1500, blindSpeed: 'normal' };

const HTML = `
  <div id="pkHud"><span id="pkBlinds"></span><span id="pkHand"></span></div>
  <div id="pkMsg" role="status"></div>
`;

const BAR = `
  <div id="pkRaise">
    <div class="pk-presets">
      <button data-preset="min">Min</button>
      <button data-preset="half">½ Pot</button>
      <button data-preset="pot">Pot</button>
      <button data-preset="max">All-in</button>
    </div>
    <input id="pkSlider" type="range" aria-label="Einsatz">
    <input id="pkAmount" type="number" inputmode="numeric" aria-label="Einsatz als Zahl">
  </div>
  <div class="pk-actions">
    <button id="pkFold">Fold</button>
    <button id="pkCall"></button>
    <button id="pkBet" class="primary"></button>
  </div>
  <div id="pkWait"></div>
`;

const DIALOGS = `
  <dialog id="pkSetup">
    <h2>Texas Hold'em – Sit &amp; Go</h2>
    <form method="dialog">
      <label>Gegner
        <select name="opponents">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option value="${n}">${n}</option>`).join('')}</select>
      </label>
      <label>Spielstärke
        <select name="difficulty">
          <option value="easy">Leicht</option><option value="medium">Mittel</option><option value="hard">Schwer</option>
        </select>
      </label>
      <label>Startstack
        <select name="stack">${STARTING_STACKS.map((n) => `<option value="${n}">${money(n)}</option>`).join('')}</select>
      </label>
      <label>Blinds
        <select name="speed">
          <option value="turbo">Turbo</option><option value="normal">Normal</option><option value="slow">Langsam</option>
        </select>
      </label>
      <p id="pkSmall" hidden>Auf kleinen Bildschirmen sind höchstens 6 Spieler möglich.</p>
      <div class="pk-dialog-actions">
        <button value="resume" id="pkResume">Fortsetzen</button>
        <button value="start" class="primary">Turnier starten</button>
      </div>
    </form>
  </dialog>
  <dialog id="pkEnd">
    <h2 id="pkEndTitle"></h2>
    <p id="pkEndText"></p>
    <form method="dialog" class="pk-dialog-actions">
      <button value="watch" id="pkWatch">Zuschauen</button>
      <button value="new" class="primary">Neues Turnier</button>
    </form>
  </dialog>
`;

export function startPokerGame({ table, stage, nav, header, aspect, requestRender }) {
  stage.insertAdjacentHTML('beforeend', HTML);
  nav.insertAdjacentHTML('beforeend', `<div id="pkBar">${BAR}</div>`);
  document.body.insertAdjacentHTML('beforeend', DIALOGS);
  header.insertAdjacentHTML('beforeend', '<button id="pkMenu">Neues Turnier</button>');
  const $ = (id) => document.getElementById(id);

  let controller = null;
  let unsubscribe = null;
  let snap = null;
  let endShownFor = '';   // verhindert, dass der Abschlussdialog mehrfach aufgeht
  let msgTimer;

  // --- Turnier starten / fortsetzen ---

  function begin(game) {
    unsubscribe?.();
    controller?.dispose();
    endShownFor = '';
    controller = new LocalGameController(game, { speed: () => 1 });
    unsubscribe = controller.subscribe(onSnapshot);
  }

  function openSetup() {
    const dialog = $('pkSetup'), form = dialog.querySelector('form');
    const last = { ...DEFAULT_SETUP, ...(storage.loadSetup() ?? {}) };
    // kleine Bildschirme (Phone): höchstens 6 Spieler, sonst wird es am Tisch zu eng
    const small = window.matchMedia('(max-width: 700px), (max-height: 520px)').matches;
    const maxOpponents = small ? 5 : 7;
    for (const option of form.opponents.options) option.hidden = option.disabled = Number(option.value) > maxOpponents;
    $('pkSmall').hidden = !small;
    form.opponents.value = Math.min(last.totalPlayers - 1, maxOpponents);
    form.difficulty.value = last.difficulty;
    form.stack.value = last.startingStack;
    form.speed.value = last.blindSpeed;
    $('pkResume').hidden = !storage.loadGame();
    if (!dialog.open) dialog.showModal();
  }

  $('pkSetup').addEventListener('close', () => {
    const dialog = $('pkSetup'), form = dialog.querySelector('form');
    const saved = storage.loadGame();
    if (dialog.returnValue === 'resume' && saved) {
      begin(saved);
      return;
    }
    if (dialog.returnValue !== 'start') {
      // abgebrochen (Esc): laufendes Turnier behalten, sonst erneut fragen
      if (!controller) (saved ? begin(saved) : openSetup());
      return;
    }
    const setup = {
      playerName: 'Du',
      totalPlayers: Math.min(Number(form.opponents.value), form.opponents.options[6].disabled ? 5 : 7) + 1,
      difficulty: form.difficulty.value,
      startingStack: Number(form.stack.value),
      blindSpeed: form.speed.value,
    };
    storage.saveSetup(setup);
    storage.clearGame();
    begin(newGame(setup));
  });

  $('pkMenu').addEventListener('click', openSetup);

  $('pkEnd').addEventListener('close', () => {
    if ($('pkEnd').returnValue === 'watch') controller?.spectate();
    else if ($('pkEnd').returnValue === 'new') openSetup();
  });

  // --- Spielzustand anzeigen ---

  const nameOf = (id) => snap.view.players.find((p) => p.id === id)?.name ?? id;

  function describe(event) {
    switch (event.type) {
      case 'levelUp':
        return `Blinds steigen: ${money(event.level.sb)}/${money(event.level.bb)}`;
      case 'action': {
        const name = nameOf(event.playerId), a = event.action;
        if (a.type === 'fold') return `${name} foldet`;
        if (a.type === 'check') return `${name} checkt`;
        if (a.type === 'call') return `${name} callt ${money(a.amount)}`;
        if (a.type === 'bet') return `${name} setzt ${money(a.amount)}`;
        if (a.type === 'raise') return `${name} erhöht auf ${money(a.amount)}`;
        return `${name} geht All-in (${money(a.amount)})`;
      }
      case 'potAwarded': {
        const names = event.winners.map((w) => nameOf(w.playerId));
        const hand = event.handKey ? ` mit ${CATEGORY[event.handKey]}` : '';
        return names.length > 1
          ? `${names.join(' und ')} teilen sich ${money(event.amount)}${hand}`
          : `${names[0]} gewinnt ${money(event.amount)}${hand}`;
      }
      case 'eliminated':
        return `${nameOf(event.playerId)} scheidet aus (Platz ${event.place})`;
      case 'tournamentComplete':
        return `${nameOf(event.winnerId)} gewinnt das Turnier`;
      default:
        return null;
    }
  }

  function showMessage(text) {
    const el = $('pkMsg');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => el.classList.remove('show'), 4500);
  }

  function onSnapshot(next) {
    snap = next;
    const view = snap.view;
    table.setSnapshot(snap, aspect());
    requestRender();

    const ante = view.level.ante ? ` · Ante ${money(view.level.ante)}` : '';
    $('pkBlinds').textContent = `Blinds ${money(view.level.sb)}/${money(view.level.bb)}${ante}`;
    $('pkHand').textContent = view.handNumber ? `Hand ${view.handNumber}` : '';

    const texts = snap.events.map(describe).filter(Boolean);
    if (texts.length) showMessage(texts.slice(-2).join(' · '));

    renderBar();
    checkEnd();
  }

  // --- Aktionsleiste ---

  let raiseTo = 0;

  function setRaise(value) {
    const legal = snap.view.legal;
    raiseTo = snapRaiseTo(value, snap.view.level.sb, legal.minRaiseTo, legal.maxRaiseTo);
    $('pkSlider').value = raiseTo;
    $('pkAmount').value = raiseTo;
    const allIn = raiseTo >= legal.maxRaiseTo;
    $('pkBet').textContent = allIn ? `All-in ${money(raiseTo)}` : `${legal.isBet ? 'Bet' : 'Raise auf'} ${money(raiseTo)}`;
  }

  function renderBar() {
    const view = snap.view, legal = view.legal;
    const myTurn = !!legal && view.toActId === HERO_ID && view.phase === 'betting';
    $('pkBar').classList.toggle('my-turn', myTurn);
    if (!myTurn) {
      const actor = view.players.find((p) => p.id === view.toActId);
      $('pkWait').textContent = view.phase === 'tournamentComplete' ? 'Turnier beendet'
        : snap.heroEliminated ? 'Du bist ausgeschieden'
        : actor ? `${actor.name} ist am Zug …` : '';
      return;
    }
    $('pkFold').disabled = !legal.canFold;
    $('pkCall').textContent = legal.canCheck ? 'Check' : `Call ${money(legal.callAmount)}`;
    $('pkRaise').hidden = $('pkBet').hidden = !legal.canRaise;
    if (legal.canRaise) {
      const slider = $('pkSlider');
      slider.min = legal.minRaiseTo;
      slider.max = legal.maxRaiseTo;
      slider.step = view.level.sb;
      $('pkAmount').min = legal.minRaiseTo;
      $('pkAmount').max = legal.maxRaiseTo;
      setRaise(legal.minRaiseTo);
    }
  }

  const act = (action) => controller?.act(action);
  $('pkFold').addEventListener('click', () => act({ type: 'fold' }));
  $('pkCall').addEventListener('click', () => act({ type: snap.view.legal?.canCheck ? 'check' : 'call' }));
  $('pkBet').addEventListener('click', () => act({ type: 'raise', amount: raiseTo }));
  $('pkSlider').addEventListener('input', (ev) => setRaise(Number(ev.target.value)));
  $('pkAmount').addEventListener('change', (ev) => setRaise(Number(ev.target.value)));
  $('pkRaise').addEventListener('click', (ev) => {
    const preset = ev.target.dataset?.preset;
    const legal = snap?.view.legal;
    if (!preset || !legal) return;
    // Pot-Raise: mitgehen und dann den Pot (inklusive des eigenen Calls) setzen
    const pot = snap.view.potTotal + legal.callAmount;
    setRaise({
      min: legal.minRaiseTo,
      half: legal.currentBet + pot / 2,
      pot: legal.currentBet + pot,
      max: legal.maxRaiseTo,
    }[preset]);
  });

  // --- Turnierende / Ausscheiden ---

  function checkEnd() {
    const view = snap.view;
    const total = view.players.length;
    const done = view.phase === 'tournamentComplete';
    if (!done && !(snap.heroEliminated && !snap.spectating)) return;
    const key = done ? 'done' : 'out';
    if (endShownFor === key) return;
    endShownFor = key;
    const place = view.placements.find((p) => p.playerId === HERO_ID)?.place ?? 1;
    const won = done && place === 1;
    $('pkEndTitle').textContent = won ? 'Turniersieg!' : done ? 'Turnier beendet' : 'Ausgeschieden';
    $('pkEndText').textContent = won
      ? 'Du hast alle Chips gewonnen. Stark gespielt!'
      : `Du bist auf Platz ${place} von ${total} gelandet.`;
    $('pkWatch').hidden = done;
    // das Ergebnis der letzten Hand noch kurz stehen lassen
    setTimeout(() => { if (!$('pkEnd').open && !$('pkSetup').open) $('pkEnd').showModal(); }, 2500);
  }

  openSetup();
  return {
    relayout: () => { if (snap) { table.setSnapshot({ ...snap, events: [] }, aspect()); requestRender(); } },
    get controller() { return controller; },
    get snapshot() { return snap; },
  };
}
