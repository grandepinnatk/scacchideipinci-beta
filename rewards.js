// ─── rewards.js — sistema badge e mazzi di carte ─────────────────────────────
// Dipende da Firebase (importato da firebase.js tramite shared.js).
// Esporta: initRewards(), checkAndAwardBadges(), getActiveDeck(), setActiveDeck()

import { getDatabase, ref, get, update } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { getCurrentUser } from './shared.js?v=1.4.5';

const db = getDatabase();

// ── Definizione Badge ─────────────────────────────────────────────────────────
export const BADGE_DEFS = [
  {
    id:    'first_win',
    label: 'Boom!!',
    desc:  'Prima partita vinta',
    icon:  '💥',
    color: '#e8a020',
    check: (s) => s.totalWins >= 1,
  },
  {
    id:    'streak_3',
    label: '3 in a Row',
    desc:  '3 vittorie consecutive',
    icon:  '🔥',
    color: '#ff7c30',
    check: (s) => s.streak >= 3,
  },
  {
    id:    'streak_5',
    label: 'On Fire',
    desc:  '5 vittorie consecutive',
    icon:  '🌋',
    color: '#ff4500',
    check: (s) => s.streak >= 5,
  },
  {
    id:    'streak_10',
    label: '10 in a Row',
    desc:  '10 vittorie consecutive',
    icon:  '⚡',
    color: '#ffe030',
    check: (s) => s.streak >= 10,
  },
  {
    id:    'streak_15',
    label: 'Inarrestabile',
    desc:  '15 vittorie consecutive',
    icon:  '🏆',
    color: '#d4a843',
    check: (s) => s.streak >= 15,
  },
  {
    id:    'razor_win',
    label: 'Filo di lana',
    desc:  'Vittoria con 1 punto di scarto',
    icon:  '🪡',
    color: '#5dca8a',
    check: (s) => s.lastMargin === 1 && s.lastResult === 'win',
  },
  {
    id:    'dragon',
    label: 'Dragon',
    desc:  'Vittoria con più di 20 punti di scarto',
    icon:  '🐉',
    color: '#9955cc',
    check: (s) => s.lastMargin > 20 && s.lastResult === 'win',
  },
  {
    id:    'super_saiyan',
    label: 'Super Saiyan',
    desc:  'Vittoria con più di 30 punti di scarto',
    icon:  '✨',
    color: '#ffe030',
    check: (s) => s.lastMargin > 30 && s.lastResult === 'win',
  },
];

// ── Definizione Mazzi ─────────────────────────────────────────────────────────
export const DECK_DEFS = [
  {
    id:         'classic',
    label:      'Classico',
    desc:       'Illustrazioni in stile pittura fiamminga',
    icon:       '🎨',
    folder:     'img/1000',
    minElo:     0,
    alwaysOwned: true,
  },
  {
    id:         'cartoon',
    label:      'Cartoon',
    desc:       'Illustrazioni in stile cartone animato',
    icon:       '🖍️',
    folder:     'img/1010',
    minElo:     1010,
    alwaysOwned: false,
  },
  {
    id:         'space',
    label:      'Spaziale',
    desc:       'Illustrazioni a tema cosmico e fantascientifico',
    icon:       '🚀',
    folder:     'img/1020',
    minElo:     1020,
    alwaysOwned: false,
  },
  {
    id:         'simpsons',
    label:      'Simpson',
    desc:       'Illustrazioni a tema Springfield',
    icon:       '🟡',
    folder:     'img/1030',
    minElo:     1030,
    alwaysOwned: false,
  },
];

// ── Stato locale ──────────────────────────────────────────────────────────────
let _userRewards = {
  badges:      {},   // { badge_id: { unlockedAt, seen } }
  ownedDecks:  [],   // ['classic', 'cartoon', ...]
  activeDeck:  'classic',
  streak:      0,
  totalWins:   0,
};

export function getUserRewards() { return _userRewards; }

// ── Inizializzazione: carica da Firebase ──────────────────────────────────────
export async function initRewards() {
  const user = getCurrentUser();
  if (!user) return;
  const snap = await get(ref(db, `users/${user.uid}`));
  if (!snap.exists()) return;
  const d = snap.val();

  _userRewards.badges     = d.badges     || {};
  _userRewards.activeDeck = d.activeDeck || 'classic';
  _userRewards.streak     = d.streak     || 0;
  _userRewards.totalWins  = d.wins       || 0;

  // Sblocca retroattivamente i mazzi in base all'ELO attuale
  // (gestisce i giocatori che hanno raggiunto la soglia prima del deploy del sistema premi)
  const currentElo  = d.elo || 1000;
  const savedDecks  = d.ownedDecks || ['classic'];
  const ownedDecks  = [...savedDecks];
  let   deckUpdated = false;

  for (const deck of DECK_DEFS) {
    if (!deck.alwaysOwned && !ownedDecks.includes(deck.id) && currentElo >= deck.minElo) {
      ownedDecks.push(deck.id);
      deckUpdated = true;
    }
  }

  if (deckUpdated) {
    await update(ref(db, `users/${user.uid}`), { ownedDecks });
  }

  _userRewards.ownedDecks = ownedDecks;

  // Aggiorna UI notifica
  _updateBadgeNotification();
  // Aggiorna PIECE_IMG con il mazzo attivo
  applyDeck(_userRewards.activeDeck);
}

// ── Controlla e assegna badge + sblocca mazzi dopo una partita ────────────────
export async function checkAndAwardRewards(gameResult) {
  // gameResult: { won, myPts, oppPts, newElo }
  const user = getCurrentUser();
  if (!user) return;

  const snap = await get(ref(db, `users/${user.uid}`));
  if (!snap.exists()) return;
  const d = snap.val();

  // Aggiorna streak
  const streak = gameResult.won ? (d.streak || 0) + 1 : 0;
  const totalWins = d.wins || 0;
  const margin = Math.abs(gameResult.myPts - gameResult.oppPts);

  const state = {
    streak,
    totalWins,
    lastMargin: margin,
    lastResult: gameResult.won ? 'win' : 'loss',
  };

  // Controlla badge
  const existingBadges = d.badges || {};
  const newBadges = {};
  for (const def of BADGE_DEFS) {
    if (!existingBadges[def.id] && def.check(state)) {
      newBadges[def.id] = { unlockedAt: Date.now(), seen: false };
    }
  }

  // Controlla mazzi sbloccati per ELO
  const newElo = gameResult.newElo;
  const ownedDecks = [...(d.ownedDecks || ['classic'])];
  for (const deck of DECK_DEFS) {
    if (!deck.alwaysOwned && !ownedDecks.includes(deck.id) && newElo >= deck.minElo) {
      ownedDecks.push(deck.id);
    }
  }

  // Scrivi su Firebase
  const updates = { streak };
  if (Object.keys(newBadges).length > 0) {
    updates.badges = { ...existingBadges, ...newBadges };
  }
  if (ownedDecks.length !== (d.ownedDecks || ['classic']).length) {
    updates.ownedDecks = ownedDecks;
  }
  await update(ref(db, `users/${user.uid}`), updates);

  // Aggiorna stato locale
  _userRewards.badges     = updates.badges || existingBadges;
  _userRewards.ownedDecks = ownedDecks;
  _userRewards.streak     = streak;

  // Notifica se ci sono badge nuovi
  const newCount = Object.values(_userRewards.badges).filter(b => !b.seen).length;
  _updateBadgeNotification(newCount);
}

// ── Marca badge come visti ────────────────────────────────────────────────────
export async function markBadgesSeen() {
  const user = getCurrentUser();
  if (!user) return;
  const snap = await get(ref(db, `users/${user.uid}/badges`));
  if (!snap.exists()) return;
  const badges = snap.val();
  const updated = {};
  for (const [k, v] of Object.entries(badges)) {
    updated[k] = { ...v, seen: true };
  }
  await update(ref(db, `users/${user.uid}`), { badges: updated });
  _userRewards.badges = updated;
  _updateBadgeNotification(0);
}

// ── Cambia mazzo attivo ───────────────────────────────────────────────────────
export async function setActiveDeck(deckId) {
  const user = getCurrentUser();
  if (!user) return;
  if (!_userRewards.ownedDecks.includes(deckId)) return;
  _userRewards.activeDeck = deckId;
  await update(ref(db, `users/${user.uid}`), { activeDeck: deckId });
  applyDeck(deckId);
}

export function getActiveDeck() {
  return _userRewards.activeDeck;
}

// ── Applica mazzo al PIECE_IMG ────────────────────────────────────────────────
export function applyDeck(deckId) {
  const deck = DECK_DEFS.find(d => d.id === deckId) || DECK_DEFS[0];
  if (window._gameModule && window._gameModule.setPieceDeckFolder) {
    window._gameModule.setPieceDeckFolder(deck.folder);
  }
}

// ── Notifica badge non visti ──────────────────────────────────────────────────
function _updateBadgeNotification(countOverride) {
  const count = countOverride !== undefined
    ? countOverride
    : Object.values(_userRewards.badges).filter(b => !b.seen).length;
  const el = document.getElementById('rewards-badge-count');
  if (!el) return;
  el.textContent = count > 0 ? count : '';
  el.style.display = count > 0 ? '' : 'none';
}
