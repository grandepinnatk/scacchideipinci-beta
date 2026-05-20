export const APP_VERSION = "1.4.5";

// ─── shared.js — stato condiviso tra auth, matchmaking e game ────────────────

export let currentUser = null;
export function setCurrentUser(u) { currentUser = u; }
export function getCurrentUser() { return currentUser; }

export const MP = {
  isOnline: false,
  gameId: null,
  myIndex: 0,
  opponentName: '',
  gameRef: null,
  presenceRef: null,
  queueRef: null,
  pollTimer: null,
  isInQueue: false,
  inviteRef: null,
  heartbeatInterval: null,
  disconnectTimer: null,
  turnTimer: null,
  eloUpdated: false,
  gameStartTime: 0,
};

export const TURN_TIMEOUT_MS = 45000;
export const ABANDON_MS      = 120000;

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}

// Callbacks registrati da auth.js per permettere a matchmaking.js di chiamarli
// senza dipendenza circolare
export const authCallbacks = {
  loadLobby:       null,
  loadLeaderboard: null,
};
