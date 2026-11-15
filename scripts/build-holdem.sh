#!/usr/bin/env bash
# Bündelt Spiellogik, KI-Gegner und Turniersteuerung aus dem Repository
# jochenhammes/texasholdem zu fertigen ES-Modulen in vendor/texasholdem/.
# Die App selbst braucht keinen Build-Schritt; dieses Skript läuft nur, wenn
# die Poker-Engine aktualisiert werden soll.
#
#   scripts/build-holdem.sh [Pfad zum texasholdem-Checkout]
set -euo pipefail

SRC="$(cd "${1:-../jochenhammes/texasholdem}" && pwd)"
OUT="$(cd "$(dirname "$0")/.." && pwd)/vendor/texasholdem"
ESBUILD="npx --yes esbuild@0.24.0"
mkdir -p "$OUT"

cd "$SRC"
$ESBUILD --bundle --format=esm --target=es2020 --loader=ts --outfile="$OUT/holdem.js" <<'ENTRY'
export { LocalGameController, newGame, HERO_ID } from './src/game/localController';
export { storage } from './src/game/storage';
export { snapRaiseTo } from './src/game/betSizing';
export { STARTING_STACKS, HANDS_PER_LEVEL } from './src/engine/tournament';
export { createTournament, startHand, applyAction, advance, legalActions, totalChips } from './src/engine/engine';
export { toView } from './src/engine/view';
export { makeTournamentConfig } from './src/engine/tournament';
export { decideWithFallback } from './src/ai/decide';
export { makeProfile } from './src/ai/profiles';
export { rankOf, suitOf } from './src/engine/cards';
ENTRY
$ESBUILD src/ai/worker.ts --bundle --format=esm --target=es2020 --outfile="$OUT/worker.js"

# Der KI-Worker liegt als fertige Datei neben dem Modul.
sed -i 's#"./worker.ts"#"./worker.js"#' "$OUT/holdem.js"
# Eigene Speicherschlüssel, damit sich Spielstände nicht mit der Original-App
# auf derselben Domain in die Quere kommen.
sed -i 's#"holdem\.\(savedGame\|lastSetup\|stats\)\.v1"#"rubics.poker.\1.v1"#' "$OUT/holdem.js"

echo "Quelle: https://github.com/jochenhammes/texasholdem @ $(git rev-parse HEAD)" > "$OUT/VERSION"
grep -c 'worker.js' "$OUT/holdem.js" >/dev/null
grep -c 'rubics.poker.savedGame.v1' "$OUT/holdem.js" >/dev/null
echo "Fertig: $OUT"
