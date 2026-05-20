// ─── ai.js — motore di gioco per partita contro il computer ──────────────────
// Dipende solo da game.js (nessun Firebase)
//
// Esporta:
//   AI.active      — true quando si gioca contro il PC
//   AI.difficulty  — 'easy' | 'medium' | 'hard'
//   AI.scheduleMove(delay?) — pianifica la prossima mossa del PC
//   playVsAI(difficulty)    — avvia una partita contro il PC
//   cancelAI()              — resetta lo stato AI

import { G, SETTINGS, zoneOf, makePiece, selectCard, canPlay, doInsert as _origDoInsert } from './game.js?v=1.4.5';

// ─── Stato AI ─────────────────────────────────────────────────────────────────
export const AI = {
  active:      false,
  difficulty:  'medium',
  humanIndex:  0,
  _timer:      null,
  _pendingSecond: undefined,
};

// ─── Entry point: avvia partita vs PC ────────────────────────────────────────
export function playVsAI(difficulty) {
  const { MP } = window._sharedModule;
  const { initGame } = window._gameModule;

  AI.active     = true;
  AI.difficulty = difficulty || 'medium';
  MP.isOnline   = false;
  MP.opponentName = '';

  // Sorteggio: 0 = umano gioca come G1 (primo), 1 = umano gioca come G2 (secondo)
  AI.humanIndex = Math.random() < 0.5 ? 0 : 1;

  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  document.getElementById('app').style.display = '';
  initGame();

  // Se l'umano è G2, la CPU è G1 e deve giocare subito il primo turno
  if (AI.humanIndex === 1) {
    scheduleMove();
  }
}

export function cancelAI() {
  AI.active = false;
  if (AI._timer) { clearTimeout(AI._timer); AI._timer = null; }
}

// ─── Schedulatore ─────────────────────────────────────────────────────────────
// Chiamato da game.js dopo ogni renderAll quando è il turno del PC (G.turn === 1)
export function scheduleMove(delay) {
  const cpuIndex = AI.humanIndex === 0 ? 1 : 0;
  if (!AI.active || G.over || G.turn !== cpuIndex) return;
  if (AI._timer) clearTimeout(AI._timer);
  const ms = delay !== undefined ? delay : _thinkDelay();
  AI._timer = setTimeout(() => {
    AI._timer = null;
    const cpuIdx = AI.humanIndex === 0 ? 1 : 0;
    if (!AI.active || G.over || G.turn !== cpuIdx) return;
    _makeMove();
  }, ms);
}

// Pausa "pensiero" in ms — varia per difficoltà e aggiunge un po' di jitter
function _thinkDelay() {
  const base = { easy: 900, medium: 700, hard: 500 }[AI.difficulty] || 700;
  return base + Math.random() * 400;
}

// ─── Dispatcher mosse per difficoltà ─────────────────────────────────────────
function _makeMove() {
  switch (AI.difficulty) {
    case 'easy':   _moveEasy();   break;
    case 'medium': _moveMedium(); break;
    case 'hard':   _moveHard();   break;
    default:       _moveMedium();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACILE — weighted random: preferisce carte di rarità alta ma non valuta il campo
// ═══════════════════════════════════════════════════════════════════════════════
function _moveEasy() {
  const cpuIdx = AI.humanIndex === 0 ? 1 : 0;
  const basket  = G.basket;
  // Filtra carte non giocabili; peso proporzionale al valore
  const weights = basket.map(p => canPlay(p.tier, cpuIdx) ? p.val : 0);
  // Fallback: se tutte bloccate (non dovrebbe accadere) usa qualsiasi carta
  const anyPlayable = weights.some(w => w > 0);
  const finalWeights = anyPlayable ? weights : basket.map(p => p.val);
  const idx = _weightedRandom(finalWeights);
  _playCard(idx);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEDIO — greedy a 1 passo: simula ogni inserimento, sceglie il delta migliore
//         con ~10% di probabilità di giocare la seconda scelta (errore umano)
// ═══════════════════════════════════════════════════════════════════════════════
function _moveMedium() {
  const scored = _scoreAllMoves();
  scored.sort((a, b) => b.score - a.score);

  // 10% di probabilità di scegliere la seconda carta migliore (se esiste)
  const pickSecond = scored.length > 1 && Math.random() < 0.10;
  const chosen = pickSecond ? scored[1] : scored[0];
  _playCard(chosen.idx);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIFFICILE — greedy con lookahead posizionale + ottimizzazione coppia (turno 2+)
// ═══════════════════════════════════════════════════════════════════════════════
function _moveHard() {
  // Quante carte deve ancora inserire il PC in questo turno?
  const isFirstTurn   = G.turnNum === 1;
  const piecesTotal   = isFirstTurn ? 2 : 2; // G2 inserisce sempre 2
  const piecesLeft    = piecesTotal - G.pieceStep;

  if (piecesLeft >= 2) {
    // Ottimizza la coppia (card1, card2): testa tutte le coppie ordinate
    const best = _bestPair();
    _playCard(best.first);
    // Il secondo pezzo viene schedulato automaticamente da scheduleMove()
    // dopo il renderAll che segue il primo inserimento.
    // Salviamo il secondo indice per usarlo quando tocca.
    AI._pendingSecond = best.second;
  } else if (AI._pendingSecond !== undefined) {
    // Stiamo inserendo il secondo pezzo della coppia pianificata
    const idx = AI._pendingSecond;
    AI._pendingSecond = undefined;
    _playCard(idx);
  } else {
    // Fallback greedy semplice (non dovrebbe servire)
    const scored = _scoreAllMoves();
    scored.sort((a, b) => b.score - a.score);
    _playCard(scored[0].idx);
  }
}

// ─── Valutazione: score di ogni singola carta nel basket ──────────────────────
function _scoreAllMoves() {
  const cpuIdx = AI.humanIndex === 0 ? 1 : 0;
  return G.basket.map((piece, idx) => {
    if (!canPlay(piece.tier, cpuIdx)) return { idx, score: -Infinity };
    const score = _simulateInsert(G.pipe, G.pts, piece, cpuIdx);
    return { idx, score };
  });
}

// ─── Valutazione: miglior coppia di carte (hard mode) ────────────────────────
function _bestPair() {
  let bestScore = -Infinity;
  let best = { first: 0, second: 0 };

  const cpuIdxPair = AI.humanIndex === 0 ? 1 : 0;
  for (let i = 0; i < G.basket.length; i++) {
    if (!canPlay(G.basket[i].tier, cpuIdxPair)) continue;
    // Stato dopo il primo inserimento
    const pipe1 = _clonePipe(G.pipe);
    const pts1  = [...G.pts];
    _applyInsert(pipe1, pts1, G.basket[i], cpuIdxPair);

    for (let j = 0; j < G.basket.length; j++) {
      if (j === i) continue; // non si può giocare la stessa carta due volte

      // Stato dopo il secondo inserimento
      const pipe2 = _clonePipe(pipe1);
      const pts2  = [...pts1];
      _applyInsert(pipe2, pts2, G.basket[j], cpuIdxPair);

      const score = _evalState(pipe2, pts2) + _positionalBonus(pipe2, cpuIdxPair);
      if (score > bestScore) {
        bestScore = score;
        best = { first: i, second: j };
      }
    }
  }
  return best;
}

// ─── Simula un inserimento e ritorna il delta di punteggio ───────────────────
function _simulateInsert(pipe, pts, piece, playerIdx) {
  const pipeCopy = _clonePipe(pipe);
  const ptsCopy  = [...pts];
  _applyInsert(pipeCopy, ptsCopy, piece, playerIdx);
  return _evalState(pipeCopy, ptsCopy) + _positionalBonus(pipeCopy, playerIdx);
}

// ─── Applica un inserimento su copie di pipe/pts (non tocca G) ───────────────
function _applyInsert(pipe, pts, piece, playerIdx) {
  if (playerIdx === 1) {
    // G2: shift left, inserisce in cella 4
    for (let i = 0; i < 4; i++) pipe[i].p2 = pipe[i + 1].p2;
    pipe[4].p2 = piece;
  } else {
    for (let i = 4; i > 0; i--) pipe[i].p1 = pipe[i - 1].p1;
    pipe[0].p1 = piece;
  }
  // Risolvi combattimenti
  for (let c = 0; c < 5; c++) {
    const slot = pipe[c];
    if (!slot.p1 || !slot.p2) continue;
    const z  = zoneOf(c);
    const v1 = slot.p1.z[z];
    const v2 = slot.p2.z[z];
    const multiplier = c === 2 ? 2 : 1; // Sala del Re vale 2
    if (v1 > v2) pts[0] += multiplier;
    else if (v2 > v1) pts[1] += multiplier;
  }
}

// ─── Funzione di valutazione: delta punti normalizzato ───────────────────────
// Valore positivo = vantaggio per il PC
function _evalState(pipe, pts) {
  const cpuIdx = AI.humanIndex === 0 ? 1 : 0;
  return cpuIdx === 1 ? (pts[1] - pts[0]) : (pts[0] - pts[1]);
}

// ─── Bonus posizionale: valuta dove si trovano le carte sul campo ─────────────
// Per ogni carta del PC, aggiunge un bonus se il valore nella zona attuale
// è superiore all'eventuale carta avversaria nella stessa cella.
// Penalizza le carte avversarie ben posizionate.
function _positionalBonus(pipe, playerIdx) {
  let bonus = 0;
  for (let c = 0; c < 5; c++) {
    const slot = pipe[c];
    const z    = zoneOf(c);
    const mult = c === 2 ? 2 : 1;

    const myPiece  = playerIdx === 1 ? slot.p2 : slot.p1;
    const oppPiece = playerIdx === 1 ? slot.p1 : slot.p2;

    if (myPiece && !oppPiece) {
      // Carta sola in campo: piccolo bonus se è in una zona dove è forte
      bonus += myPiece.z[z] * 0.05 * mult;
    }
    if (!myPiece && oppPiece) {
      // Carta avversaria sola: lieve penalità
      bonus -= oppPiece.z[z] * 0.05 * mult;
    }
    if (myPiece && oppPiece) {
      // Entrambe presenti: bonus se stiamo vincendo il confronto
      const myVal  = myPiece.z[z];
      const oppVal = oppPiece.z[z];
      if (myVal > oppVal)  bonus += 0.15 * mult;
      if (myVal < oppVal)  bonus -= 0.15 * mult;
    }
  }
  return bonus;
}

// ─── Utilità ──────────────────────────────────────────────────────────────────
function _clonePipe(pipe) {
  return pipe.map(slot => ({ p1: slot.p1, p2: slot.p2 }));
}

function _weightedRandom(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ─── Esegui la mossa: seleziona carta e chiama doInsert ──────────────────────
function _playCard(idx) {
  const cpuIndex = AI.humanIndex === 0 ? 1 : 0;
  if (G.over || G.turn !== cpuIndex) return;
  selectCard(idx);
  // Usa window.doInsert per rispettare l'intercettazione di matchmaking.js
  const fn = typeof window.doInsert === 'function' ? window.doInsert : _origDoInsert;
  fn();
}
