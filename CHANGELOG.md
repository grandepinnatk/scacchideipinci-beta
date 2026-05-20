# Changelog — Scacchi dei Pinci

---

## [1.4.6] — 2026-03-29

### Nuove funzionalità — Sistema Premi

**Badge (`rewards.js`)** — Otto badge sbloccabili in base alle prestazioni, salvati su Firebase per utente e persistenti tra sessioni. Ogni badge ha icona emoji, colore identificativo, etichetta e descrizione:

| Badge | Evento |
|-------|--------|
| 💥 Boom!! | Prima partita vinta |
| 🔥 3 in a Row | 3 vittorie consecutive |
| 🌋 On Fire | 5 vittorie consecutive |
| ⚡ 10 in a Row | 10 vittorie consecutive |
| 🏆 Inarrestabile | 15 vittorie consecutive |
| 🪡 Filo di lana | Vittoria con 1 punto di scarto |
| 🐉 Dragon | Vittoria con più di 20 punti di scarto |
| ✨ Super Saiyan | Vittoria con più di 30 punti di scarto |

**Mazzi di carte** — Quattro mazzi con illustrazioni diverse, sbloccabili per soglia ELO. Una volta sbloccato, il mazzo rimane disponibile anche se l'ELO scende. Le immagini sono organizzate in `img/1000/` (base, sempre disponibile), `img/1010/` (Cartoon), `img/1020/` (Spaziale, placeholder), `img/1030/` (Simpson, placeholder):

| Mazzo | ELO richiesto |
|-------|---------------|
| 🎨 Classico | sempre disponibile |
| 🖍️ Cartoon | ELO ≥ 1010 |
| 🚀 Spaziale | ELO ≥ 1020 |
| 🟡 Simpson | ELO ≥ 1030 |

**Icona Premi in lobby** — Pulsante 🏅 nell'header accanto al selettore layout. Mostra un badge rosso con il numero di premi non ancora visti. Cliccando apre il popup Premi.

**Popup Premi** — Modale fullscreen con due tab:
- *Badge*: griglia di card, una per badge; locked=grigio/desaturato, unlocked=colorato con data sblocco, new=evidenziato con pillola "NUOVO" e animazione pulse
- *Mazzi di Carte*: lista con stato IN USO / DISPONIBILE / ELO richiesto; click seleziona il mazzo e salva la preferenza su Firebase

**Notifiche non visti** — Il contatore sul pulsante si azzera 1.5s dopo l'apertura del popup (marcatura asincrona su Firebase).

### Modifiche tecniche
- Nuovo file `rewards.js` (256 righe): importa Firebase direttamente, esporta `initRewards`, `checkAndAwardRewards`, `markBadgesSeen`, `setActiveDeck`, `getActiveDeck`, `applyDeck`, `BADGE_DEFS`, `DECK_DEFS`, `getUserRewards`
- `game.js`: nuovo export `setPieceDeckFolder(folder)` — aggiorna il prefisso del path in `getPieceImg`; tutti i path in `PIECE_IMG` migrati da `img/` a `img/1000/`
- `matchmaking.js`: `updateEloStats` chiama `window._rewards.checkAndAwardRewards()` dopo ogni aggiornamento ELO
- `auth.js`: carica `rewards.js` con import dinamico, espone `window._rewards`, applica il mazzo salvato non appena il modulo game è pronto
- Struttura cartelle: le immagini base spostate da `img/` a `img/1000/`; immagini Cartoon estratte in `img/1010/` con mapping automatico dei nomi

## [1.4.5] — 2026-03-29

### Modifiche architettura
- **Gestione audio separata in modulo dedicato** (`audio-hooks.js`) — `game.js` non importa più direttamente `audio.js`. Al suo posto espone eventi tramite `window._audioHooks.onXxx()`. Il nuovo file `audio-hooks.js` (42 righe) è l'unico punto di contatto tra la logica di gioco e il sintetizzatore audio: importa `SFX` da `audio.js` e mappa ogni evento al suono corrispondente. Per silenziare o sostituire l'intero sistema audio è sufficiente modificare solo questo file. `audio-hooks.js` viene caricato dinamicamente da `auth.js` con `import()` insieme agli altri moduli lazy.

### Nuove funzionalità
- **Bounce visivo sulla carta vincente** — al termine di ogni combattimento la `piece-chip` del vincitore esegue un'animazione `bounce-win`: scale 1→1.10→0.96→1.04→1 in 420ms con curva elastica. La funzione `bounceWinner(cellIdx, winner)` viene chiamata direttamente da `doInsert` subito dopo `flashCell`, 150ms prima del re-render, così il chip è già aggiornato quando il bounce parte. In caso di pareggio nessun bounce viene eseguito.

### Modifiche tecniche
- `game.js`: rimossi import e chiamate dirette a `SFX`; aggiunto `bounceWinner` esportato; `selectCard` e `doInsert` chiamano `window._audioHooks` solo se definito (graceful degradation se audio non disponibile)
- `style.css`: aggiunto `@keyframes bounce-win` e `.piece-chip.bounce-win` vicino a `.combat-flash`

---

## [1.4.4] — 2026-03-29

### Nuove funzionalità
- **Effetti sonori** (`audio.js`) — tutti i suoni sono sintetizzati al volo via Web Audio API, senza file audio esterni da caricare. Quattro eventi sonori distinti:
  - **Selezione carta** — tick secco a due oscillatori (sine + square) quando una carta viene evidenziata nel basket
  - **Giocata carta** — suono di lancio breve (sawtooth + sine con frequency ramp + noise burst) al momento dell'inserimento
  - **Scorrimento carte** — whoosh direzionale (noise filtrato + sweep tonale) che si attiva 60ms dopo la giocata, sincronizzato con l'animazione di slide; il senso del suono varia in base alla direzione (destra/sinistra)
  - **Combattimento** — impatto metallico (burst di rumore a due bande) con tonalità ascendente breve in caso di vittoria o suono neutro in caso di pareggio
  - **Fine partita** — fanfara ascendente a 4 note (Do–Mi–Sol–Do) per vittoria; sequenza discendente a 4 note per sconfitta; applicati sia in modalità online che vs CPU che locale

### Modifiche tecniche
- Nuovo file `audio.js` (172 righe) esportato come modulo ES; importato da `game.js`
- `SFX.setVolume(0..1)` disponibile per regolazioni future dal menu impostazioni
- L'`AudioContext` viene riattivato al primo click utente (requisito sicurezza browser)
- La deseleziona di una carta non produce suono (solo la selezione)

---

## [1.4.3] — 2026-03-28

### Nuove funzionalità
- **Sistema temi** — tre layout selezionabili tramite tre pulsanti circolari posizionati in alto a destra nella lobby, accanto al nome utente. La scelta è persistente in `localStorage` (`sdp-theme`). Temi disponibili:
  - ⬛ **Classico** — il design originale scuro con palette sabbia/oro, invariato
  - 🌑 **Moderno Scuro** — sfondo quasi nero con sfumature viola, score-card orizzontali con avatar silhouette, bordi tier luminosi nelle bcard, celle campo con tonalità più saturi
  - 🌕 **Moderno Chiaro** — sfondo marmo bianco con gradienti sottili, score-card con avatar, bcard su fondo bianco con gradienti colorati per rarità, testo scuro
- **Score-card ridisegnate (temi moderni)** — layout orizzontale: avatar silhouette a sinistra di G1, a destra di G2; nome giocatore sopra il punteggio; barra di avanzamento nascosta; card attiva evidenziata con box-shadow colorato
- **Avatar nelle score-card** — in partita online l'avatar reale del giocatore loggato (Google/Microsoft photo) appare nella propria score-card; altrimenti viene mostrata la silhouette SVG generica

### Modifiche tecniche
- Nuovo file `themes.css` (299 righe) con variabili CSS per ciascun tema tramite `[data-theme]` sull'elemento `<html>`; nessuna modifica a `style.css` esistente
- `scoreboard` HTML arricchito con `.sc-avatar` e `.sc-text` per supportare il layout orizzontale dei temi moderni; compatibile con il tema classico (`.sc-avatar` nascosto via `display:none`)
- `game.js`: nuova funzione `_updateScoreAvatars()` chiamata da `renderScore` per aggiornare gli avatar in base al contesto (online/AI/locale)
- Script inline `(function(){...})()` applicato prima del primo paint per evitare flash di tema scorretto

---

## [1.4.2] — 2026-03-28

### Nuove funzionalità
- **Limiti di gioco per rarità** — introdotte regole che limitano il numero di carte non-comuni in gioco contemporaneamente per ciascun giocatore, basate sui conteggi in pipe al momento dell'inserimento:
  - **Rara (R):** giocabile solo se dopo l'inserimento si hanno al massimo 2 carte non-comuni in gioco e nessuna Leggendaria
  - **Epica (E):** giocabile solo se dopo l'inserimento si hanno al massimo 2 carte non-comuni, nessuna Leggendaria e nessun'altra Epica già in gioco (al massimo 1 Epica alla volta)
  - **Leggendaria (L):** giocabile solo se sarà l'unica carta non-comune in gioco (deve stare da sola)
  - **Comune (C):** sempre giocabile
- **Carte non giocabili grigie nel basket** — le carte che non rispettano i limiti di rarità vengono rese con classe `.bcard.locked`: opacità ridotta, desaturazione, cursore `not-allowed` e overlay scuro. Non sono selezionabili né cliccabili
- **Badge tier in plancia** — ogni piece-chip nel campo di gioco mostra un piccolo badge colorato accanto al nome: `C` grigio, `R` blu, `E` viola, `L` oro. Corrisponde ai badge già presenti nel basket
- **Versione app visibile** — numero di versione mostrato in basso al centro dello schermo in ogni schermata, sovrapposto alla UI tramite `position:fixed`
- **AI rispetta i limiti di rarità** — il motore AI (tutte e tre le difficoltà) non gioca carte che violerebbero i limiti: Facile assegna peso 0 alle carte bloccate, Medio e Difficile assegnano `−Infinity` ai candidati non giocabili

### Modifiche tecniche
- Nuova funzione `canPlay(tier, playerIdx)` esportata da `game.js`: conta i tier in pipe per il giocatore e applica le regole
- Nuova funzione `countTiersInPipe(playerIdx)`: ritorna `{ l, e, r, nonCommon }`
- `selectCard` rifiuta la selezione di carte locked prima di modificare `G.selected`
- `renderBasket`: `locked` calcolato per ogni carta; le card locked ricevono `pointer-events:none` e nessun listener eventi

---

## [1.4.1] — 2026-03-28

### Modifiche UI
- **Rimosso header dalla pagina di gioco** — eliminati il div `.header` con il titolo "Scacchi dei Pinci" e il pulsante impostazioni `⚙` (`btn-settings-open`) dalla pagina di gioco. Il campo, il basket e i controlli occupano ora tutto lo spazio verticale disponibile senza intestazione superflua

---

## [1.4.0] — 2026-03-28

Questa release consolida le funzionalità introdotte nelle versioni 1.3.8 e 1.3.9, corregge tre bug nella modalità vs CPU e aggiunge il sorteggio del primo turno.

### Motore AI — Gioca vs CPU (`ai.js`)

Nuovo modulo `ai.js` (zero dipendenze Firebase) che implementa tre livelli di difficoltà. Il giocatore umano è sempre dalla parte sorteggiata; il CPU gioca automaticamente con un ritardo variabile (500–1300 ms) che simula il pensiero.

- **🎲 Facile** — weighted random proporzionale al valore `val` di ogni carta nel basket. Non valuta il campo né simula combattimenti. Adatto per imparare le meccaniche.
- **⚔ Medio** — greedy a 1 passo: simula ogni possibile inserimento (fino a 10 carte), sceglie il delta `pts[cpu]−pts[umano]` più favorevole. 10% di probabilità di optare per la seconda scelta migliore per simulare l'imperfezione umana.
- **💀 Difficile** — ottimizzazione sulla coppia: testa tutte le coppie ordinate di carte (fino a 90 combinazioni per il doppio inserimento del turno) e aggiunge un bonus posizionale che valuta la forza di ogni carta in campo nella propria zona corrente. Raramente sbaglia.

Il pulsante "Gioca in locale" è stato rinominato in **"🤖 Gioca vs CPU"** e reindirizzato a una nuova schermata di selezione difficoltà (`screen-ai-difficulty`). Al termine della partita il giocatore torna automaticamente alla selezione difficoltà.

### Sorteggio del primo turno

All'avvio di ogni partita vs CPU, `playVsAI` sorteggia con `Math.random()` chi gioca per primo. Il campo `AI.humanIndex` registra il risultato: `0` = umano è G1 (va per primo), `1` = umano è G2 (la CPU apre il gioco). Se la CPU ottiene G1, `scheduleMove()` viene chiamato immediatamente dopo `initGame()`. Tutte le funzioni del motore (`scheduleMove`, `_scoreAllMoves`, `_bestPair`, `_playCard`, `_evalState`) usano `cpuIndex = humanIndex === 0 ? 1 : 0` al posto del valore hardcoded `1`, inclusa la funzione di valutazione che inverte il segno del delta quando la CPU è G1.

### Correzione nomi giocatori in modalità vs CPU

`renderScore` aggiornava i label `.sc-label` nel DOM solo quando `MP.isOnline`. Dopo una partita online, i nomi dell'avversario rimanevano scritti nel DOM e venivano mostrati anche nella partita successiva vs CPU. Corretti anche `renderBanner` e l'overlay finale (`showWinner`).

Tre rami ora distinti in `renderScore`:
- `MP.isOnline` → nomi della partita online (comportamento invariato)
- `AI.active` → nome utente loggato nel lato umano; `"CPU — Facile/Medio/Difficile"` nell'altro lato, coerente con il sorteggio
- else → ripristina `"GIOCATORE 1"` / `"GIOCATORE 2"` per non lasciare mai residui

`MP.opponentName` viene azzerato a ogni avvio di `playVsAI` per sicurezza. `showWinner` usa `AI.humanIndex` per determinare correttamente il vincitore indipendentemente da quale slot occupa l'umano.

### Partite vs CPU escluse dalle statistiche

Le partite contro il motore AI non modificano ELO, vittorie, sconfitte né partite giocate. Guard esplicito in `updateEloStats`: se `window._aiModule.AI.active` è `true` la funzione ritorna immediatamente senza toccare Firebase.

### Stato giocatore in classifica

Ogni riga della classifica — lobby e `leaderboard.html` — mostra un pallino colorato come seconda colonna:

- 🟢 **Verde** — online (`lastSeen` negli ultimi 5 minuti)
- 🟠 **Arancio** — in gioco (`inGame: true` su Firebase)
- ⚫ **Grigio scuro** — offline

`matchmaking.js` scrive `inGame: true` all'avvio di ogni partita online e `inGame: false` in `cleanupMP`. `auth.js` aggiorna `lastSeen` ogni 90 secondi tramite heartbeat. `leaderboard.html` è stato riscritto completamente per eliminare escape Unicode doppi che impedivano il rendering dei dati e un conflict marker Git che bloccava il parsing dello script.
---

## [1.3.7] — 2026-03-27

### Modifiche UI
- **Leaderboard — paginazione completa** — la tabella mostra tutti i giocatori registrati con navigazione a pagine. Menu a tendina per scegliere 10, 20 o 50 righe per pagina. Barra di navigazione con prima/ultima pagina sempre visibili, finestra di 3 pagine intorno alla corrente, ellissi (`…`) per i salti. Indicatore testuale "X–Y di N". Al caricamento la vista si apre sulla pagina che contiene la propria riga

---

## [1.3.6] — 2026-03-27

### Modifiche UI
- **Leaderboard — restyling completo** — `leaderboard.html` ridisegnata con lo stesso sistema visivo della lobby: font `BurbankBig` embedded, palette CSS identica, layout `.lobby-box`
- **Leaderboard — podio top 3** — sezione "PODIO" con `.stat-card` a griglia 3 colonne; primo posto evidenziato con `--goldbg` e bordo `--gold`
- **Leaderboard — taglio intelligente** — primi 10 giocatori con separatore `· · ·` e riga utente contestuale

---

## [1.3.5] — 2026-03-26

### Nuove funzionalità
- **Pagina classifica completa** (`leaderboard.html`) — tutti i giocatori ordinati per ELO, medaglie top 3, evidenziazione propria riga, contatore totale, pulsante "← Lobby"
- **Link in lobby** — titolo "CLASSIFICA" con link "Vedi completa →"

---

## [1.3.4] — 2026-03-26

### Correzioni
- **Scroll pagina** — risolto bug `align-items:center` su `.screen.show` con `position:fixed` che tagliava il contenuto in alto su viewport piccole

---

## [1.3.3] — 2026-03-26

### Modifiche UI
- **Classifica** — ridotta a Top 10; font tabella 18px su desktop

---

## [1.3.2] — 2026-03-26

### Nuove funzionalità
- **Classifica** — estesa a 15 giocatori con riga utente separata da `···`
- **Statistiche personali** — card POSIZIONE (`#N`), griglia 4 colonne

---

## [1.3.1] — 2026-03-26

### Correzioni
- **Classifica lobby** — gestione errori con messaggio visivo

---

## [1.3.0] — 2026-03-26

### Modifiche UI
- **Lobby** — classifica spostata sotto i pulsanti di gioco

---

## [1.2.9] — 2026-03-25

### Correzioni
- **Classifica** — ordinamento lato client invece di `orderByChild`

---

## [1.2.8] — 2026-03-25

### Correzioni
- **Carte e pesi admin** — `applyAdminConfig` usa `PIECE_OVERRIDES` e rigenera `POOL`

---

## [1.2.7] — 2026-03-25

### Correzioni
- **Punteggio vittoria multiplayer** — P1 salva `winPts` nel nodo partita; entrambi lo leggono in `startOnlineGame`

---

## [1.2.6] — 2026-03-25

### Nuove funzionalità
- **Console admin — Pesi rarità** — slider 0–30 per ogni fascia. Default: L=1, E=3, R=6, C=12

---

## [1.2.5] — 2026-03-25

### Nuove funzionalità
- **Console admin** (`admin.html`) — gestione carte, impostazioni e amministratori
- Al login viene caricata la configurazione admin da Firebase

---

## [1.2.4] — 2026-03-25

### Modifiche regole
- **Punteggio vittoria** — portato a 50 punti

---

## [1.2.3] — 2026-03-25

### Correzioni
- **Matchmaking cross-provider** — rimosso meccanismo "claim" che causava deadlock tra utenti Google ed email

---

## [1.2.2] — 2026-03-25

### Correzioni
- **Multiplayer — turno non passava** — `window.doInsert` ora punta alla versione intercettata di `matchmaking.js`

---

## [1.2.1] — 2026-03-20

### Correzioni
- **Doppio click (PC)** — sostituito con listener unico con timer 220ms per evitare doppio toggle

---

## [1.2.0] — 2026-03-20

### Nuove funzionalità
- **Animazione scorrimento carte** — chip animano nella direzione di spinta con curva elastica
- **Doppio click (PC)** — seleziona e gioca immediatamente
- **Swipe verso l'alto (mobile/tablet)** — seleziona e gioca (soglia 40px verticali)
- Animazione `.playing` sulla carta giocata

---

## [1.1.8] — 2026-03-20

### Correzioni
- **Partita rapida** — guard in `onAuthStateChanged` per non interrompere matchmaking durante rinnovo token

---

## [1.1.7] — 2026-03-19

### Correzioni
- **Nuova partita dopo abbandono** — `initGame()` chiamato all'inizio di `startOnlineGame`

---

## [1.1.6] — 2026-03-19

### Modifiche regole
- **Sala del Re** — confronto vale 2 punti invece di 1

---

## [1.1.5] — 2026-03-19

### Modifiche regole
- **Turno 1** — G1 inserisce 1 carta, G2 ne inserisce 2

---

## [1.1.4] — 2026-03-19

### Correzioni UI
- **Lobby** — barra separatrice tra Online / In gioco

---

## [1.1.3] — 2026-03-19

### Correzioni
- **Partita rapida** — `getCurrentUser()` introdotta in `shared.js` per eliminare binding statico ES modules

---

## [1.1.2] — 2026-03-19

### Correzioni UI
- `.mp-bar-conn`: `font-size` aumentato a `18px`

---

## [1.1.1] — 2026-03-19

### Correzioni UI
- Overlay `.pc-info`: gradiente sostituito con grigio semitrasparente `rgba(40,38,35,0.75)`

---

## [1.1.0] — 2026-03-19 🎨 Artwork definitivo

- 40 illustrazioni ridisegnate in stile pittorico fiammingo
- Lane G1/G2 con altezza fissa (280px), illustrazioni a pieno campo con overlay
- CSS estratto in `style.css`, corretti nomi file `illetterato.png` e `limpiccato.png`

---

## [1.0.0] — 2026-03-17 🎉 Prima release pubblica

- Campo 5 caselle, 3 zone, 40 pezzi, rarità a 4 fasce, punteggio vittoria 50pt
- Multiplayer Firebase: login, ELO, classifica, partita rapida, invita amico, timer 45s
- Architettura modulare ES: `firebase.js`, `shared.js`, `game.js`, `matchmaking.js`, `auth.js`, `style.css`
