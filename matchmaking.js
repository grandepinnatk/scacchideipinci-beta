// ─── matchmaking.js — quick match, invite, partita online, timer, forfeit ────

import { db, auth }          from './firebase.js?v=1.4.5';
import { ref, set, get, update, onValue, off, push, remove, query, orderByChild, limitToLast }
                               from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { MP, currentUser, setCurrentUser, getCurrentUser, TURN_TIMEOUT_MS, ABANDON_MS, showScreen, authCallbacks } from './shared.js?v=1.4.5';
import { G, POOL, SETTINGS, tierOf, initGame, renderAll, showWinner,
         doInsert as _origDoInsert, resetGame as _origResetGame } from './game.js?v=1.4.5';

// ─── QUICK MATCH ─────────────────────────────────────────────────────────────
export async function showQuickMatch() {
  showScreen('screen-quickmatch');
  document.getElementById('qm-status').textContent = 'Cercando un avversario...';

  // Guard: aspetta che Firebase completi l'autenticazione
  let user = getCurrentUser();
  if (!user) {
    await new Promise(resolve => {
      const interval = setInterval(() => {
        user = getCurrentUser();
        if (user) { clearInterval(interval); resolve(); }
      }, 200);
      setTimeout(() => { clearInterval(interval); resolve(); }, 5000);
    });
    user = getCurrentUser();
  }
  if (!user) {
    showScreen('screen-auth');
    return;
  }

  const myUid  = user.uid;
  const myName = user.displayName || user.email.split('@')[0];

  // ── Scrivo me stesso nella coda ──────────────────────────────────────────
  MP.queueRef  = ref(db, 'matchmaking/queue/' + myUid);
  MP.isInQueue = true;
  await set(MP.queueRef, { uid: myUid, name: myName, t: Date.now() });

  // ── Ascolto il mio slot di notifica — se arriva un gameId sono P2 ────────
  const matchSlot = ref(db, 'matchmaking/match/' + myUid);
  onValue(matchSlot, async snap => {
    if (!snap.exists()) return;
    off(matchSlot);
    const { gameId, hostName } = snap.val();
    await remove(matchSlot);
    if (!MP.isInQueue) return; // già gestito come P1
    MP.isInQueue = false;
    if (MP.pollTimer) { clearTimeout(MP.pollTimer); MP.pollTimer = null; }
    if (MP.queueRef)  { await remove(MP.queueRef);  MP.queueRef  = null; }
    // Sono P2
    await startOnlineGame(gameId, 1, hostName);
  });

  // ── Polling — ogni 2s cerco un avversario nella coda ─────────────────────
  async function poll() {
    if (!MP.isInQueue) return;

    let snap;
    try { snap = await get(ref(db, 'matchmaking/queue')); }
    catch(e) { if (MP.isInQueue) MP.pollTimer = setTimeout(poll, 2000); return; }

    if (!snap || !snap.exists() || !MP.isInQueue) {
      if (MP.isInQueue) MP.pollTimer = setTimeout(poll, 2000);
      return;
    }

    // Trovo il primo avversario in coda (diverso da me)
    let oppUid = null, oppName = null;
    snap.forEach(child => {
      if (!oppUid && child.key !== myUid) {
        oppUid  = child.key;
        oppName = child.val().name || 'Avversario';
      }
    });

    if (!oppUid) {
      MP.pollTimer = setTimeout(poll, 2000);
      return;
    }

    // ── Provo a diventare P1: rimuovo me stesso dalla coda prima di tutto ──
    // Se nel frattempo l'avversario mi ha già rimosso (race), riprendo come P2
    MP.isInQueue = false;
    if (MP.queueRef) { await remove(MP.queueRef); MP.queueRef = null; }

    // Verifico che l'avversario sia ancora in coda prima di procedere
    const oppStillInQueue = await get(ref(db, 'matchmaking/queue/' + oppUid));
    if (!oppStillInQueue.exists()) {
      // L'avversario è già stato preso da qualcun altro — aspetto come P2
      MP.isInQueue = true;
      MP.queueRef = ref(db, 'matchmaking/queue/' + myUid);
      await set(MP.queueRef, { uid: myUid, name: myName, t: Date.now() });
      MP.pollTimer = setTimeout(poll, 1000);
      return;
    }
    await remove(ref(db, 'matchmaking/queue/' + oppUid));

    const gameId = push(ref(db, 'games')).key;
    const state  = buildInitialGameState();

    await set(ref(db, 'games/' + gameId), {
      p1:      { uid: myUid,  name: myName  },
      p2:      { uid: oppUid, name: oppName },
      state,
      winPts:       SETTINGS.winPts,
      status:       'playing',
      createdAt:    Date.now(),
      turnDeadline: Date.now() + TURN_TIMEOUT_MS,
      presence:     { [myUid]: Date.now(), [oppUid]: Date.now() }
    });

    // Notifico P2
    await set(ref(db, 'matchmaking/match/' + oppUid), { gameId, hostName: myName });

    // Avvio come P1
    await startOnlineGame(gameId, 0, oppName);
  }

  MP.pollTimer = setTimeout(poll, 1500);
}

export async function cancelQuickMatch() {
  MP.isInQueue = false;
  if (MP.pollTimer)  { clearTimeout(MP.pollTimer);  MP.pollTimer  = null; }
  if (MP.queueRef)   { await remove(MP.queueRef);   MP.queueRef   = null; }
  const matchSlot = ref(db, 'matchmaking/match/' + getCurrentUser().uid);
  await remove(matchSlot);
  showScreen('screen-lobby');
}

// ─── INVITE ──────────────────────────────────────────────────────────────────
export async function showInvite() {
  showScreen('screen-invite');
  document.getElementById('join-err').textContent = '';
  document.getElementById('invite-waiting').style.display = 'none';
  const code   = Math.random().toString(36).substring(2,8).toUpperCase();
  const p1name = getCurrentUser().displayName || getCurrentUser().email.split('@')[0];
  document.getElementById('invite-code').textContent = code;
  MP.inviteRef = ref(db,'invites/'+code);
  await set(MP.inviteRef, { hostUid:getCurrentUser().uid, hostName:p1name, createdAt:Date.now(), status:'waiting' });
  onValue(MP.inviteRef, async snap => {
    if (!snap.exists()) return;
    const data = snap.val();
    if (data.status === 'joined' && data.guestUid !== getCurrentUser().uid) {
      off(MP.inviteRef);
      const gameId = push(ref(db,'games')).key;
      const state  = buildInitialGameState();
      await set(ref(db,'games/'+gameId), {
        p1:{ uid:getCurrentUser().uid, name:p1name }, p2:{ uid:data.guestUid, name:data.guestName },
        state, createdAt:Date.now(), status:'playing',
        turnDeadline:Date.now()+TURN_TIMEOUT_MS,
        presence:{ [getCurrentUser().uid]:Date.now(), [data.guestUid]:Date.now() }
      });
      await update(MP.inviteRef, { gameId });
      startOnlineGame(gameId, 0, data.guestName);
    }
  });
  document.getElementById('invite-waiting').style.display = 'block';
}
export function copyCode() {
  const code = document.getElementById('invite-code').textContent;
  navigator.clipboard.writeText(code).catch(()=>{});
  document.getElementById('invite-code').textContent = '✓ Copiato!';
  setTimeout(() => document.getElementById('invite-code').textContent = code, 1500);
}
export async function joinByCode() {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  if (code.length !== 6) { document.getElementById('join-err').textContent = 'Codice non valido'; return; }
  const invSnap = await get(ref(db,'invites/'+code));
  if (!invSnap.exists() || invSnap.val().status !== 'waiting') {
    document.getElementById('join-err').textContent = 'Codice non trovato o scaduto'; return;
  }
  const invData   = invSnap.val();
  if (invData.hostUid === getCurrentUser().uid) {
    document.getElementById('join-err').textContent = 'Non puoi unirti alla tua partita'; return;
  }
  const guestName = getCurrentUser().displayName || getCurrentUser().email.split('@')[0];
  await update(ref(db,'invites/'+code), { status:'joined', guestUid:getCurrentUser().uid, guestName });
  onValue(ref(db,'invites/'+code), snap => {
    if (snap.exists() && snap.val().gameId) {
      off(ref(db,'invites/'+code));
      startOnlineGame(snap.val().gameId, 1, invData.hostName);
    }
  });
}
export async function cancelInvite() {
  if (MP.inviteRef) { await remove(MP.inviteRef); MP.inviteRef = null; }
  showScreen('screen-lobby');
}

// ─── INITIAL GAME STATE ──────────────────────────────────────────────────────
export function buildInitialGameState() {
  return {
    pts:[0,0], turnNum:1, turn:0, pieceStep:0,
    pipe:{'0':{p1:null,p2:null},'1':{p1:null,p2:null},'2':{p1:null,p2:null},'3':{p1:null,p2:null},'4':{p1:null,p2:null}},
    basket:Array(10).fill(null).map(()=>{
      const t = POOL[Math.floor(Math.random()*POOL.length)];
      return { name:t.name, z:[...t.z], val:t.val, tier:tierOf(t.val), id:Math.random() };
    }),
    log:[], over:false, firstTurnDone:[false,false], selected:-1
  };
}

// ─── START ONLINE GAME ───────────────────────────────────────────────────────

// ─── NORMALIZE FIREBASE STATE ────────────────────────────────────────────────
// Firebase serializes arrays as objects with numeric keys {0:..., 1:...}
// This function converts them back to proper JS arrays
export function normalizeState(state) {
  if (!state) return state;

  // Firebase omette i valori null negli oggetti — ricostruiamo gli array con indici espliciti

  // ── pipe: deve essere sempre 5 slot {p1, p2} ────────────────────────────
  if (state.pipe) {
    const pipeArr = Array(5).fill(null).map(() => ({ p1: null, p2: null }));
    const rawPipe = Array.isArray(state.pipe) ? state.pipe : Object.entries(state.pipe);
    const entries = Array.isArray(state.pipe)
      ? state.pipe.map((v, i) => [i, v])
      : Object.entries(state.pipe);
    entries.forEach(([i, slot]) => {
      const idx = parseInt(i);
      if (idx >= 0 && idx < 5) {
        const s = slot || { p1: null, p2: null };
        const normPiece = (p) => {
          if (!p) return null;
          if (p.z && !Array.isArray(p.z)) p.z = Object.values(p.z);
          return p;
        };
        pipeArr[idx] = { p1: normPiece(s.p1), p2: normPiece(s.p2) };
      }
    });
    state.pipe = pipeArr;
  }

  // ── basket: array di 10 pezzi ─────────────────────────────────────────
  if (state.basket && !Array.isArray(state.basket)) {
    state.basket = Object.values(state.basket);
  }
  if (state.basket) {
    state.basket = state.basket.map(p => {
      if (!p) return p;
      if (p.z && !Array.isArray(p.z)) p.z = Object.values(p.z);
      return p;
    });
  }

  // ── pts, firstTurnDone, log ───────────────────────────────────────────
  if (state.pts && !Array.isArray(state.pts)) {
    state.pts = [state.pts[0] ?? 0, state.pts[1] ?? 0];
    if (!Array.isArray(state.pts)) state.pts = Object.values(state.pts);
  }
  if (state.firstTurnDone && !Array.isArray(state.firstTurnDone)) {
    state.firstTurnDone = Object.values(state.firstTurnDone);
  }
  if (state.log && !Array.isArray(state.log)) {
    state.log = Object.values(state.log);
  }

  return state;
}


export async function startOnlineGame(gameId, myIndex, opponentName) {
  // Reset G a stato pulito prima di ogni partita
  initGame();

  // Sostituisci window.doInsert con la versione intercettata per il multiplayer
  window.doInsert = doInsert;

  MP.isOnline      = true;
  MP.gameId        = gameId;
  MP.myIndex       = myIndex;
  MP.opponentName  = opponentName;
  // Segna il giocatore come "in gioco" su Firebase (per il pallino arancio in classifica)
  if (getCurrentUser()) {
    update(ref(db,'users/'+getCurrentUser().uid), { inGame: true, lastSeen: Date.now() });
  }
  MP.gameRef       = ref(db,'games/'+gameId+'/state');
  // Save for reconnect
  set(ref(db,'activeGame/'+getCurrentUser().uid), { gameId, myIndex, opponentName });

  // Show game UI
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('show'));
  document.getElementById('app').style.display = '';
  document.getElementById('mp-bar').classList.add('show');
  document.getElementById('mp-bar-name').textContent = 'VS ' + opponentName;

  // Player name labels
  const myName  = getCurrentUser().displayName || getCurrentUser().email.split('@')[0];
  const p1label = myIndex === 0 ? myName : opponentName;
  const p2label = myIndex === 1 ? myName : opponentName;
  document.getElementById('sc1').querySelector('.sc-label').textContent = p1label;
  document.getElementById('sc2').querySelector('.sc-label').textContent = p2label;

  // Replace "Nuova partita" with "Termina Partita"
  const btnReset = document.getElementById('btn-reset');
  if (btnReset) {
    btnReset.textContent = 'Termina Partita';
    btnReset.style.color = '#ff6b47';
    btnReset.style.borderColor = 'rgba(255,107,71,0.4)';
  }

  // Presence heartbeat every 20s
  MP.presenceRef = ref(db,'games/'+gameId+'/presence/'+getCurrentUser().uid);
  set(MP.presenceRef, Date.now());
  if (MP.heartbeatInterval) clearInterval(MP.heartbeatInterval);
  MP.heartbeatInterval = setInterval(() => set(MP.presenceRef, Date.now()), 20000);

  // Load game state from Firebase — this is the single source of truth
  // Retry a few times in case data isn't ready yet (race condition on P2 side)
  let initSnap = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    initSnap = await get(MP.gameRef);
    if (initSnap.exists()) break;
    await new Promise(r => setTimeout(r, 500)); // wait 500ms and retry
  }
  if (initSnap && initSnap.exists()) {
    const gameData = initSnap.val();
    // Applica winPts della partita (impostato da P1 al momento della creazione)
    const gameNode = await get(ref(db, 'games/' + gameId));
    if (gameNode.exists() && gameNode.val().winPts) {
      SETTINGS.winPts = gameNode.val().winPts;
    }
    const normalized = normalizeState(gameData);
    Object.assign(G, normalized);
    G.selected = -1;
    renderAll();
    updateOnlineUI();
    if (!G.over) startTurnTimer();
  }

  // Listen to game state — single source of truth
  MP.eloUpdated = false;
  onValue(MP.gameRef, snap => {
    if (!snap.exists()) return;
    const state = normalizeState(snap.val());
    if (state) Object.assign(G, state);
    G.selected = -1;
    renderAll();
    updateOnlineUI();
    if (state.over) {
      clearTurnTimer();
      if (!MP.eloUpdated) {
        MP.eloUpdated = true;
        setTimeout(async () => {
          await updateEloStats(state);
          showWinner();
        }, 400);
      }
    } else {
      startTurnTimer();
    }
  });

  // Watch opponent presence for disconnection
  // Use a grace period: don't check disconnection for the first 60s of the game
  MP.gameStartTime = Date.now();
  const presAllRef = ref(db,'games/'+gameId+'/presence');
  onValue(presAllRef, snap => {
    if (!snap.exists()) return;
    const presence = snap.val();
    const now = Date.now();
    // Grace period: ignore disconnection checks for first 60 seconds
    if (now - MP.gameStartTime < 60000) return;
    Object.entries(presence).forEach(([uid, ts]) => {
      if (uid === getCurrentUser().uid) return;
      if (!ts || ts === 0) return; // opponent hasn't connected yet
      const age = now - ts;
      const dot    = document.getElementById('mp-dot');
      const status = document.getElementById('mp-bar-status');
      if (age > ABANDON_MS) {
        handleOpponentAbandoned();
      } else if (age > 30000) {
        if (dot) dot.classList.add('off');
        if (status) status.textContent = 'Avversario disconnesso...';
        if (!MP.disconnectTimer)
          MP.disconnectTimer = setTimeout(handleOpponentAbandoned, ABANDON_MS - age);
      } else {
        if (dot) dot.classList.remove('off');
        if (status) status.textContent = 'Connesso';
        if (MP.disconnectTimer) { clearTimeout(MP.disconnectTimer); MP.disconnectTimer = null; }
      }
    });
  });
}

// ─── TURN TIMER ──────────────────────────────────────────────────────────────
export function startTurnTimer() {
  clearTurnTimer();
  if (G.over) return;
  MP.turnTimerEnd = Date.now() + TURN_TIMEOUT_MS;
  // Show countdown in mp-bar
  const statusEl = document.getElementById('mp-bar-status');
  MP.turnTimer = setInterval(() => {
    const rem = Math.max(0, MP.turnTimerEnd - Date.now());
    const sec = Math.ceil(rem / 1000);
    if (statusEl) {
      if (G.turn === MP.myIndex) {
        statusEl.textContent = 'Il tuo turno — ' + sec + 's';
        statusEl.style.color = sec <= 10 ? '#ff6b47' : '';
      } else {
        statusEl.textContent = 'Turno avversario — ' + sec + 's';
        statusEl.style.color = '';
      }
    }
    if (rem <= 0) {
      clearTurnTimer();
      if (G.turn === MP.myIndex && !G.over) autoPlayWorstCard();
    }
  }, 500);
}
export function clearTurnTimer() {
  if (MP.turnTimer) { clearInterval(MP.turnTimer); MP.turnTimer = null; }
  const statusEl = document.getElementById('mp-bar-status');
  if (statusEl) { statusEl.textContent = 'Connesso'; statusEl.style.color = ''; }
}
export function autoPlayWorstCard() {
  // Pick card with lowest total (z sum + val), break ties by val
  let worstIdx   = 0;
  let worstScore = Infinity;
  G.basket.forEach((p, i) => {
    const score = (p.z[0]+p.z[1]+p.z[2]) + (p.val||0);
    if (score < worstScore) { worstScore = score; worstIdx = i; }
  });
  G.selected = worstIdx;
  doInsert();
}

// ─── FORFEIT / ABANDON ───────────────────────────────────────────────────────
export async function forfeitGame() {
  if (!MP.isOnline || !MP.gameId) return;
  showForfeitModal();
}
export function showForfeitModal() {
  document.getElementById('forfeit-modal').classList.add('show');
}
export async function confirmForfeit() {
  document.getElementById('forfeit-modal').classList.remove('show');
  await applyGameOver(false);
  // Loser leaves immediately; winner sees HAI VINTO via onValue then clicks Torna alla lobby
  await cleanupMP(true);
}
export function cancelForfeit() {
  document.getElementById('forfeit-modal').classList.remove('show');
}
export async function handleOpponentAbandoned() {
  if (!MP.gameId || G.over) return;
  clearTurnTimer();
  if (MP.disconnectTimer) { clearTimeout(MP.disconnectTimer); MP.disconnectTimer = null; }
  await applyGameOver(true);
}
export async function applyGameOver(weWin) {
  if (G.over) return;
  clearTurnTimer();
  const pts = [...G.pts];
  if (weWin) { pts[MP.myIndex] = SETTINGS.winPts; pts[1-MP.myIndex] = 0; }
  else       { pts[1-MP.myIndex] = SETTINGS.winPts; pts[MP.myIndex] = 0; }
  const serializePipe = (pipe) => {
    const obj = {};
    (pipe||[]).forEach((slot, i) => { obj[i] = { p1: slot?.p1||null, p2: slot?.p2||null }; });
    return obj;
  };
  const finalState = { ...G, pts, pipe: serializePipe(G.pipe), over:true, selected:-1 };
  await set(MP.gameRef, finalState);
  await update(ref(db,'games/'+MP.gameId), { status:'finished' });
  // Non chiamare showWinner qui — onValue su entrambi i client gestirà il rendering
  // incluso il popup HAI VINTO / HAI PERSO personalizzato
}

// ─── CLEANUP ─────────────────────────────────────────────────────────────────
export async function cleanupMP(returnToLobby = true) {
  clearTurnTimer();
  if (MP.heartbeatInterval) { clearInterval(MP.heartbeatInterval); MP.heartbeatInterval = null; }
  if (MP.disconnectTimer)   { clearTimeout(MP.disconnectTimer);    MP.disconnectTimer   = null; }
  if (MP.pollTimer)  { clearTimeout(MP.pollTimer);  MP.pollTimer  = null; }
  if (MP.gameRef)    { off(MP.gameRef);               MP.gameRef    = null; }
  if (MP.inviteRef)  { await remove(MP.inviteRef);    MP.inviteRef  = null; }
  if (MP.queueRef)   { await remove(MP.queueRef);     MP.queueRef   = null; }
  MP.isInQueue = false;
  if (getCurrentUser())  await remove(ref(db,'activeGame/'+getCurrentUser().uid));
  MP.isOnline = false;
  MP.gameId   = null;
  // Ripristina window.doInsert alla versione locale (non multiplayer)
  if (window._origDoInsert) window.doInsert = window._origDoInsert;
  // Segna il giocatore come "non in gioco" su Firebase
  if (getCurrentUser()) {
    update(ref(db,'users/'+getCurrentUser().uid), { inGame: false, lastSeen: Date.now() });
  }

  const btnReset = document.getElementById('btn-reset');
  if (btnReset) { btnReset.textContent='Nuova partita'; btnReset.style.color=''; btnReset.style.borderColor=''; }
  document.getElementById('mp-bar').classList.remove('show');
  document.getElementById('app').style.display = 'none';
  if (returnToLobby && getCurrentUser()) { if (authCallbacks.loadLeaderboard) authCallbacks.loadLeaderboard(); showScreen('screen-lobby'); if (authCallbacks.loadLobby) authCallbacks.loadLobby(getCurrentUser()); }
}

// ─── ELO UPDATE ──────────────────────────────────────────────────────────────
export async function updateEloStats(state) {
  if (!getCurrentUser()) return;
  // Le partite vs CPU non modificano ELO né statistiche
  if (window._aiModule && window._aiModule.AI.active) return;
  const won   = state.pts[MP.myIndex] >= SETTINGS.winPts || state.pts[MP.myIndex] > state.pts[1-MP.myIndex];
  const myPts = state.pts[MP.myIndex];
  const oppPts= state.pts[1-MP.myIndex];
  const snap  = await get(ref(db,'users/'+getCurrentUser().uid));
  if (!snap.exists()) return;
  const d      = snap.val();
  const oldElo = d.elo || 1000;
  const newElo = Math.round(oldElo + 32*((won?1:0) - 1/(1+Math.pow(10,(1000-oldElo)/400))));
  await update(ref(db,'users/'+getCurrentUser().uid), {
    played:(d.played||0)+1, wins:(d.wins||0)+(won?1:0), losses:(d.losses||0)+(won?0:1), elo:newElo
  });
  // Controlla badge e mazzi sbloccati
  if (window._rewards && window._rewards.checkAndAwardRewards) {
    await window._rewards.checkAndAwardRewards({ won, myPts, oppPts, newElo });
  }
}

// ─── INTERCEPT DOINSERT ──────────────────────────────────────────────────────
export function doInsert() {
  if (!MP.isOnline) { _origDoInsert(); return; }
  if (G.selected < 0 || G.over) return;
  if (G.turn !== MP.myIndex) return; // not your turn
  // Apply locally to compute new state
  _origDoInsert();
  // Push to Firebase — onValue will echo back to BOTH players (including us)
  // so both screens update from the same source of truth
  // Serializza pipe come oggetto con chiavi stringa per preservare gli slot null
  // (Firebase rimuove i valori null dagli array ma non dagli oggetti con chiavi stringa)
  const serializePipe = (pipe) => {
    const obj = {};
    pipe.forEach((slot, i) => {
      obj[i] = {
        p1: slot.p1 || null,
        p2: slot.p2 || null,
      };
    });
    return obj;
  };
  const stateToSave = {
    pts:G.pts, turnNum:G.turnNum, turn:G.turn, pieceStep:G.pieceStep,
    pipe:serializePipe(G.pipe), basket:G.basket, log:G.log, over:G.over,
    firstTurnDone:G.firstTurnDone, selected:-1
  };
  set(MP.gameRef, stateToSave);
};

export function resetGame() {
  if (MP.isOnline) {
    if (G.over) {
      // Partita finita — chiudi overlay e torna alla lobby
      document.getElementById('overlay').classList.remove('show');
      cleanupMP(true);
    } else {
      forfeitGame();
    }
  } else {
    _origResetGame();
  }
};

// ─── LOCAL PLAY ──────────────────────────────────────────────────────────────
export function showAIDifficultyScreen() {
  showScreen('screen-ai-difficulty');
}

// Mantenuto per compatibilità interna
export function playLocal() {
  showAIDifficultyScreen();
}

// Aggiorna UI online dopo ogni renderAll (bottoni turno + nomi giocatori)
function updateOnlineUI() {
  if (!MP.isOnline) return;
  const btn = document.getElementById('btn-ins');
  if (btn) {
    if (G.over)                      { btn.disabled=true;  btn.textContent='Partita terminata'; }
    else if (G.turn !== MP.myIndex)  { btn.disabled=true;  btn.textContent='Turno avversario...'; }
    else { btn.disabled=(G.selected<0); btn.textContent='Gioca Carta'; }
  }
  if (getCurrentUser()) {
    const myName  = getCurrentUser().displayName || getCurrentUser().email.split('@')[0];
    const p1label = MP.myIndex===0 ? myName : MP.opponentName;
    const p2label = MP.myIndex===1 ? myName : MP.opponentName;
    const sc1 = document.getElementById('sc1')?.querySelector('.sc-label');
    const sc2 = document.getElementById('sc2')?.querySelector('.sc-label');
    if (sc1) sc1.textContent = p1label;
    if (sc2) sc2.textContent = p2label;
  }
}
