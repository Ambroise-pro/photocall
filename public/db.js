'use strict';

// Stockage local des photos sur l'iPad (IndexedDB du navigateur).
// Rien n'est envoyé en ligne, sauf la photo à transmettre par e-mail.
//
// Enregistrement : { id, createdAt, badges, consent, blob, mail, pendingEmail? }
//   mail : 'non demandé' | 'envoyé' | 'en attente'
//   pendingEmail : présent uniquement tant qu'un envoi a échoué (pas de réseau),
//                  supprimé dès que l'e-mail est parti.

const PhotoDB = (() => {
  const DB_NAME = 'photocall';
  const STORE = 'photos';
  let dbPromise = null;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbPromise;
  }

  async function tx(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const result = fn(store);
      t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  return {
    put: (photo) => tx('readwrite', (s) => s.put(photo)),
    get: (id) => tx('readonly', (s) => s.get(id)),
    remove: (id) => tx('readwrite', (s) => s.delete(id)),
    clear: () => tx('readwrite', (s) => s.clear()),
    async all() {
      const list = await tx('readonly', (s) => s.getAll());
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    // Demande au navigateur de ne pas effacer les données (important sur iPad)
    async persist() {
      try {
        return (await navigator.storage?.persist?.()) || false;
      } catch {
        return false;
      }
    },
    fileName(photo) {
      const stamp = photo.createdAt.replace(/[:.]/g, '-').slice(0, 19);
      return `${stamp}_${photo.badges}badges_${photo.consent ? 'publiable' : 'prive'}.jpg`;
    },
  };
})();

// Envoi d'une photo par e-mail via la fonction Vercel (aucun stockage serveur)
async function sendPhotoMail(blob, email, badges) {
  const image = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const res = await fetch('/api/send-mail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, email, badges }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erreur ${res.status}`);
    err.permanent = res.status === 400 || res.status === 413;
    throw err;
  }
}

// Réessaie les e-mails restés en attente (ex. coupure Wi-Fi pendant la soirée)
let retrying = false;
async function retryPendingMails() {
  if (retrying || !navigator.onLine) return 0;
  retrying = true;
  let sent = 0;
  try {
    for (const p of await PhotoDB.all()) {
      if (!p.pendingEmail) continue;
      try {
        await sendPhotoMail(p.blob, p.pendingEmail, p.badges);
        delete p.pendingEmail;
        p.mail = 'envoyé';
        await PhotoDB.put(p);
        sent++;
      } catch (err) {
        if (err.permanent) {
          delete p.pendingEmail;
          p.mail = 'échec';
          await PhotoDB.put(p);
        } else {
          break; // toujours pas de réseau
        }
      }
    }
  } finally {
    retrying = false;
  }
  return sent;
}
