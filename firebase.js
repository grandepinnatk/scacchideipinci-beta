// ─── firebase.js — inizializzazione Firebase SDK ─────────────────────────────

import { initializeApp }  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth }        from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getDatabase }    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

const firebaseConfig = {
  apiKey:            "AIzaSyBBojqNJEJ935iiXiqcmshI0hNS1iD3dow",
  authDomain:        "scacchideipincimp.firebaseapp.com",
  projectId:         "scacchideipincimp",
  storageBucket:     "scacchideipincimp.firebasestorage.app",
  messagingSenderId: "887139659354",
  appId:             "1:887139659354:web:630ab968b99e04495d3263",
  databaseURL:       "https://scacchideipincimp-default-rtdb.europe-west1.firebasedatabase.app"
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getDatabase(app);
