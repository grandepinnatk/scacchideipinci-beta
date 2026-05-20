// ─── auth.js — autenticazione, profilo utente, lobby, ELO ────────────────────

import { auth, db }           from './firebase.js?v=1.4.5';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
         signInWithPopup, signInWithRedirect, getRedirectResult,
         GoogleAuthProvider, OAuthProvider,
         onAuthStateChanged, signOut, updateProfile }
                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { ref, set, get, update, remove, onValue, off, query }
                                from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { setCurrentUser, getCurrentUser, MP, showScreen, authCallbacks, APP_VERSION } from './shared.js?v=1.4.5';
import { initGame, renderAll, switchTab, resetPieceValues, closeSettings, applySettings, openSettings, applyAdminConfig } from './game.js?v=1.4.5';
import { cleanupMP, playLocal, showQuickMatch, cancelQuickMatch,
         showInvite, cancelInvite, copyCode, joinByCode,
         forfeitGame, confirmForfeit, cancelForfeit, doInsert, resetGame,
         startOnlineGame, showAIDifficultyScreen } from './matchmaking.js?v=1.4.5';

// ─── AUTH UI ─────────────────────────────────────────────────────────────────
export function switchToRegister() {
  document.getElementById('auth-form-login').style.display = 'none';
  document.getElementById('auth-form-register').style.display = '';
  document.getElementById('auth-mode-sub').textContent = 'Crea un nuovo account';
  document.getElementById('auth-err').textContent = '';
}
export function switchToLogin() {
  document.getElementById('auth-form-register').style.display = 'none';
  document.getElementById('auth-form-login').style.display = '';
  document.getElementById('auth-mode-sub').textContent = 'Accedi per giocare online';
  document.getElementById('auth-err').textContent = '';
}
export function setAuthErr(msg) { document.getElementById('auth-err').textContent = msg; }
function firebaseErrMsg(code) {
  const map = {
    'auth/email-already-in-use':'Email già in uso','auth/invalid-email':'Email non valida',
    'auth/weak-password':'Password troppo corta (min 6 caratteri)','auth/wrong-password':'Password errata',
    'auth/user-not-found':'Nessun account con questa email','auth/invalid-credential':'Credenziali non valide',
    'auth/popup-closed-by-user':'Login annullato','auth/cancelled-popup-request':'',
  };
  return map[code] || 'Errore: ' + code;
}
export async function authLogin() {
  const email = document.getElementById('auth-email').value.trim();
  const pw    = document.getElementById('auth-password').value;
  if (!email || !pw) { setAuthErr('Compila tutti i campi'); return; }
  try { await signInWithEmailAndPassword(auth, email, pw); }
  catch(e) { setAuthErr(firebaseErrMsg(e.code)); }
}
export async function authRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pw    = document.getElementById('reg-password').value;
  if (!name || !email || !pw) { setAuthErr('Compila tutti i campi'); return; }
  if (name.length < 2) { setAuthErr('Nome troppo corto'); return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pw);
    await updateProfile(cred.user, { displayName: name });
    await createUserProfile(cred.user.uid, name);
  } catch(e) { setAuthErr(firebaseErrMsg(e.code)); }
}
export async function authGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const cred = await signInWithPopup(auth, provider);
    await ensureUserProfile(cred.user);
  } catch(e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
      // Fallback: redirect se il popup è bloccato
      await signInWithRedirect(auth, provider);
    } else if (e.code !== 'auth/cancelled-popup-request') {
      setAuthErr(firebaseErrMsg(e.code));
    }
  }
}
export async function authMicrosoft() {
  const provider = new OAuthProvider('microsoft.com');
  try {
    const cred = await signInWithPopup(auth, provider);
    await ensureUserProfile(cred.user);
  } catch(e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/popup-closed-by-user') {
      await signInWithRedirect(auth, provider);
    } else if (e.code !== 'auth/cancelled-popup-request') {
      setAuthErr(firebaseErrMsg(e.code));
    }
  }
}
export async function authLogout() {
  await cleanupMP(false);
  await signOut(auth);
}

// ─── USER PROFILE ────────────────────────────────────────────────────────────
export async function createUserProfile(uid, displayName) {
  await set(ref(db,'users/'+uid), { displayName, elo:1000, played:0, wins:0, losses:0, createdAt:Date.now() });
}
export async function ensureUserProfile(user) {
  const snap = await get(ref(db,'users/'+user.uid));
  if (!snap.exists()) await createUserProfile(user.uid, user.displayName || user.email.split('@')[0]);
  // Aggiorna lastSeen e resetta inGame (in caso di reload da partita) per il contatore utenti online
  await update(ref(db,'users/'+user.uid), { lastSeen: Date.now(), inGame: false });
}

// ─── ONLINE STATS ─────────────────────────────────────────────────────────────
let _onlineStatsUnsub = null;

let _presenceHeartbeat = null;

function startOnlineStats() {
  if (_onlineStatsUnsub) return; // already watching
  // Heartbeat lastSeen ogni 90 secondi per mantenere lo stato online aggiornato
  if (!_presenceHeartbeat) {
    _presenceHeartbeat = setInterval(() => {
      const u = getCurrentUser();
      if (u) update(ref(db,'users/'+u.uid), { lastSeen: Date.now() });
    }, 90000);
  }

  // Conta utenti online: presence > now - 2min in /users
  // Conta partite in corso: games con status='playing'
  // Usiamo due listener separati

  const usersRef = ref(db, 'users');
  const gamesRef = ref(db, 'games');

  const usersListener = onValue(usersRef, snap => {
    if (!snap.exists()) {
      document.getElementById('los-count-online').textContent = '0';
      return;
    }
    const now = Date.now();
    let online = 0;
    snap.forEach(child => {
      const d = child.val();
      // Consideriamo online chi ha aggiornato il profilo negli ultimi 5 minuti
      if (d.lastSeen && (now - d.lastSeen) < 5 * 60 * 1000) online++;
    });
    const el = document.getElementById('los-count-online');
    if (el) el.textContent = online;
  });

  const gamesListener = onValue(gamesRef, snap => {
    if (!snap.exists()) {
      document.getElementById('los-count-ingame').textContent = '0';
      return;
    }
    let ingame = 0;
    snap.forEach(child => {
      const d = child.val();
      if (d.status === 'playing') ingame++;
    });
    const el = document.getElementById('los-count-ingame');
    if (el) el.textContent = ingame;
  });

  _onlineStatsUnsub = () => { off(usersRef, 'value', usersListener); off(gamesRef, 'value', gamesListener); };
}

function stopOnlineStats() {
  if (_onlineStatsUnsub) { _onlineStatsUnsub(); _onlineStatsUnsub = null; }
  if (_presenceHeartbeat) { clearInterval(_presenceHeartbeat); _presenceHeartbeat = null; }
}

export async function loadLobby(user) {
  setCurrentUser(user);
  const name = user.displayName || user.email.split('@')[0];
  document.getElementById('lobby-username').textContent = name;
  const av = document.getElementById('lobby-avatar');
  av.innerHTML = user.photoURL ? `<img src="${user.photoURL}" alt="">` : name[0].toUpperCase();
  const snap = await get(ref(db,'users/'+user.uid));
  if (snap.exists()) {
    const d = snap.val();
    document.getElementById('stat-played').textContent = d.played || 0;
    document.getElementById('stat-wins').textContent   = d.wins   || 0;
    document.getElementById('stat-elo').textContent    = d.elo    || 1000;
  }
  // Check for resumable game
  const activeSnap = await get(ref(db,'activeGame/'+user.uid));
  if (activeSnap.exists()) {
    const { gameId, myIndex, opponentName } = activeSnap.val();
    const statusSnap = await get(ref(db,'games/'+gameId+'/status'));
    if (statusSnap.exists() && statusSnap.val() === 'playing') {
      if (confirm('Hai una partita in corso contro ' + opponentName + '. Vuoi riprendere?')) {
        startOnlineGame(gameId, myIndex, opponentName);
        return;
      }
    }
    await remove(ref(db,'activeGame/'+user.uid));
  }
  // Carica configurazione admin (punteggio vittoria, valori carte)
  try {
    const adminSnap  = await get(ref(db,'admin/settings'));
    const piecesSnap = await get(ref(db,'admin/pieces'));
    applyAdminConfig({
      winPts:   adminSnap.exists()  ? adminSnap.val().winPts           : null,
      weights:  adminSnap.exists()  ? adminSnap.val().weights          : null,
      pieces:   piecesSnap.exists() ? Object.values(piecesSnap.val()) : null,
    });
  } catch(e) { /* usa valori default */ }

  loadLeaderboard();
  startOnlineStats();
  showScreen('screen-lobby');
}
export async function loadLeaderboard() {
  const tbody = document.getElementById('lb-body');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#5a534e;padding:10px">Caricamento…</td></tr>';
  try {
    const snap = await get(ref(db,'users'));
    if (!snap.exists()) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#5a534e;padding:10px">Nessun giocatore</td></tr>';
      return;
    }
    const users = [];
    snap.forEach(c => {
      const v = c.val();
      if (v && (v.displayName || v.elo)) users.push({ uid: c.key, ...v });
    });
    users.sort((a,b) => (b.elo||1000) - (a.elo||1000));

    // Calcola posizione in classifica dell'utente corrente (su tutti, non solo top 15)
    const me = getCurrentUser();
    if (me) {
      const myRank = users.findIndex(u => u.uid === me.uid);
      const rankEl = document.getElementById('stat-rank');
      if (rankEl) rankEl.textContent = myRank >= 0 ? `#${myRank + 1}` : '—';
    }

    const top10 = users.slice(0, 10);
    const now = Date.now();
    function presenceDot(u) {
      if (u.inGame) return '<span class="lb-dot lb-dot-ingame" title="In gioco"></span>';
      if (u.lastSeen && (now - u.lastSeen) < 5 * 60 * 1000) return '<span class="lb-dot lb-dot-online" title="Online"></span>';
      return '<span class="lb-dot lb-dot-offline" title="Offline"></span>';
    }
    function makeRow(u, i, isMe) {
      return `<td class="lb-rank">${i+1}</td><td class="lb-dot-cell">${presenceDot(u)}</td><td>${u.displayName||'?'}</td><td>${u.elo||1000}</td><td>${u.wins||0}</td><td>${u.played||0}</td>`;
    }

    tbody.innerHTML = '';
    top10.forEach((u,i) => {
      const tr = document.createElement('tr');
      if (me && u.uid === me.uid) tr.className = 'lb-me';
      tr.innerHTML = makeRow(u, i, me && u.uid === me.uid);
      tbody.appendChild(tr);
    });

    // Se l'utente non è in top 10, aggiungi la sua riga in fondo separata
    if (me) {
      const myIdx = users.findIndex(u => u.uid === me.uid);
      if (myIdx >= 10) {
        const u = users[myIdx];
        const sep = document.createElement('tr');
        sep.innerHTML = '<td colspan="6" style="padding:4px 8px;color:#5a534e;font-size:11px">···</td>';
        tbody.appendChild(sep);
        const tr = document.createElement('tr');
        tr.className = 'lb-me';
        tr.innerHTML = makeRow(u, myIdx, true);
        tbody.appendChild(tr);
      }
    }
  } catch(e) {
    console.error('[Leaderboard] Errore:', e);
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#e05555;padding:10px">Errore: ${e.message}</td></tr>`;
  }
}

// ─── EXPOSE TO WINDOW ────────────────────────────────────────────────────────
window.switchToRegister = switchToRegister;
window.confirmForfeit   = confirmForfeit;
window.cancelForfeit    = cancelForfeit;
window.switchToLogin    = switchToLogin;
window.authLogin        = authLogin;
window.authRegister     = authRegister;
window.authGoogle       = authGoogle;
window.authMicrosoft    = authMicrosoft;
window.authLogout       = authLogout;
window.showQuickMatch   = showQuickMatch;
window.cancelQuickMatch = cancelQuickMatch;
window.showInvite       = showInvite;
window.copyCode         = copyCode;
window.joinByCode       = joinByCode;
window.cancelInvite     = cancelInvite;
window.playLocal        = playLocal;
window.showScreen       = (id) => { const { showScreen } = window._sharedModule || {}; if (showScreen) showScreen(id); };
window.showAIDifficultyScreen = showAIDifficultyScreen;
window.doInsert         = doInsert;
window.resetGame        = resetGame;
window.switchTab        = switchTab;
window.resetPieceValues = resetPieceValues;
window.closeSettings    = closeSettings;
window.applySettings    = applySettings;

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────
function bindEl(id, fn) { const el=document.getElementById(id); if(el) el.addEventListener('click',fn); }
bindEl('btn-auth-login',      authLogin);
bindEl('btn-auth-register',   authRegister);
bindEl('btn-auth-google',     authGoogle);
bindEl('btn-auth-microsoft',  authMicrosoft);
bindEl('btn-switch-register', switchToRegister);
bindEl('btn-switch-login',    switchToLogin);
bindEl('btn-logout',          authLogout);
bindEl('btn-quickmatch',      showQuickMatch);
bindEl('btn-invite',          showInvite);
bindEl('btn-local',           playLocal);
bindEl('btn-cancel-qm',       cancelQuickMatch);
bindEl('invite-code',         copyCode);
bindEl('btn-join-code',       joinByCode);
bindEl('btn-cancel-invite',   cancelInvite);
bindEl('btn-ins',             () => doInsert());
bindEl('btn-reset',           () => resetGame());
bindEl('btn-win-action',      () => resetGame());
bindEl('btn-settings-open',   openSettings);
document.addEventListener('click', e => {
  if (e.target.classList.contains('btn-apply'))  applySettings();
  if (e.target.classList.contains('btn-cancel')) closeSettings();
});
document.getElementById('join-code-input')?.addEventListener('keydown', e => { if(e.key==='Enter') joinByCode(); });
document.getElementById('auth-password')?.addEventListener('keydown',   e => { if(e.key==='Enter') authLogin(); });
window.addEventListener('beforeunload', () => { if(MP.presenceRef) set(MP.presenceRef, 0); });

// Registra i callbacks per matchmaking.js
authCallbacks.loadLobby       = loadLobby;
authCallbacks.loadLeaderboard = loadLeaderboard;

// ─── INIT ─────────────────────────────────────────────────────────────────────
document.getElementById('app').style.display = 'none';
initGame(); // populate G with valid structure before any render

// Aggiorna il div versione con il valore reale da shared.js
(function() {
  var el = document.getElementById('app-version');
  if (el) el.textContent = 'v' + APP_VERSION;
})();

// ─── Esposizione moduli per ai.js (accesso lazy, senza dipendenza circolare) ──
import('./shared.js?v=1.4.5').then(m => { window._sharedModule = m; });
import('./game.js?v=1.4.5').then(m   => {
  window._gameModule = m;
  // Applica il mazzo salvato non appena il modulo game è pronto
  if (window._rewards) window._rewards.applyDeck(window._rewards.getActiveDeck());
});
import('./ai.js?v=1.4.5').then(m => {
  window._aiModule = m;
  window.playVsAI  = m.playVsAI;
});
import('./audio-hooks.js?v=1.4.5').then(m => {
  m.initAudioHooks();
});
import('./rewards.js?v=1.4.5').then(m => {
  window._rewards = m;
  m.initRewards();
});

// ─── GESTIONE REDIRECT OAUTH (ritorno da Google/Microsoft redirect) ─────────
getRedirectResult(auth).then(async result => {
  if (result && result.user) {
    await ensureUserProfile(result.user);
  }
}).catch(e => {
  if (e.code && e.code !== 'auth/no-current-user') setAuthErr(firebaseErrMsg(e.code));
});

// ─── AUTH STATE ───────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  setAuthErr('');
  setCurrentUser(user);
  if (user) {
    await ensureUserProfile(user);
    // Non interrompere matchmaking o partita in corso durante un token refresh
    if (MP.isInQueue || MP.isOnline) return;
    await loadLobby(user);
  }
  else { showScreen('screen-auth'); switchToLogin(); }
});
