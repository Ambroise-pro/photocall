'use strict';

const $ = (s) => document.querySelector(s);
const fmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

let photos = [];
const urls = new Map(); // id -> object URL
const selected = new Set();

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  e.append(...children);
  return e;
}

function urlFor(p) {
  if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob));
  return urls.get(p.id);
}

function selectedPhotos() {
  return photos.filter((p) => selected.has(p.id));
}

function updateButtons() {
  const n = selected.size;
  $('#share').disabled = !n;
  $('#zip').disabled = !n;
  $('#delete-selected').disabled = !n;
  $('#share').textContent = `Partager / Enregistrer dans Photos${n ? ` (${n})` : ''}`;
  $('#zip').textContent = `⬇ Télécharger en .zip${n ? ` (${n})` : ''}`;
  $('#delete-selected').textContent = `Supprimer la sélection${n ? ` (${n})` : ''}`;
  document.querySelectorAll('.item').forEach((it) => {
    const on = selected.has(it.dataset.id);
    it.classList.toggle('selected', on);
    it.querySelector('.pick').checked = on;
  });
}

function render() {
  const consent = photos.filter((p) => p.consent).length;
  const total = photos.reduce((s, p) => s + p.badges, 0);
  const pending = photos.filter((p) => p.pendingEmail).length;
  $('#stats').replaceChildren(
    ...[
      ['Photos', photos.length],
      ['Publiables', consent],
      ['Badges validés (total)', total],
      ['Moyenne de badges', photos.length ? (total / photos.length).toFixed(1) : '-'],
      ['E-mails en attente', pending],
    ].map(([label, value]) => el('div', { className: 'stat' }, el('b', { textContent: value }), label)),
  );
  $('#retry').hidden = !pending;

  const list = $('#only-consent').checked ? photos.filter((p) => p.consent) : photos;
  if (!list.length) {
    $('#grid').replaceChildren(el('p', { className: 'empty', textContent: 'Aucune photo pour le moment.' }));
    updateButtons();
    return;
  }
  $('#grid').replaceChildren(
    ...list.map((p) => {
      const pick = el('input', { type: 'checkbox', className: 'pick', title: 'Sélectionner' });
      pick.onchange = () => {
        if (pick.checked) selected.add(p.id);
        else selected.delete(p.id);
        updateButtons();
      };
      const img = el('img', { src: urlFor(p), loading: 'lazy', alt: '' });
      img.onclick = () => {
        $('#viewer-img').src = urlFor(p);
        $('#viewer').showModal();
      };
      const share = el('button', { className: 'light', textContent: 'Partager' });
      share.onclick = () => shareFiles([p]);
      const del = el('button', { className: 'danger', textContent: 'Supprimer' });
      del.onclick = () => removePhotos([p]);
      const item = el(
        'div',
        { className: 'item' },
        pick,
        img,
        el(
          'div',
          { className: 'meta' },
          el('div', { className: 'row' },
            el('strong', { textContent: `${p.badges} badge${p.badges > 1 ? 's' : ''}` }),
            el('span', { className: 'muted', textContent: fmt.format(new Date(p.createdAt)) })),
          el('div', { className: 'row' },
            el('span', {
              className: 'tag ' + (p.consent ? 'ok' : 'no'),
              textContent: p.consent ? '✔ Publication autorisée' : '✖ Ne pas publier',
            }),
            el('span', { className: 'muted', textContent: 'E-mail : ' + p.mail })),
          el('div', { className: 'row' }, share, del),
        ),
      );
      item.dataset.id = p.id;
      return item;
    }),
  );
  updateButtons();
}

async function load() {
  photos = await PhotoDB.all();
  for (const id of [...selected]) if (!photos.some((p) => p.id === id)) selected.delete(id);
  render();
}

function toFiles(list) {
  return list.map((p) => new File([p.blob], PhotoDB.fileName(p), { type: 'image/jpeg' }));
}

function download(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Sur iPad : ouvre la feuille de partage (Enregistrer les images, AirDrop…)
async function shareFiles(list) {
  const files = toFiles(list);
  if (navigator.canShare?.({ files })) {
    try {
      await navigator.share({ files });
    } catch (err) {
      if (err.name !== 'AbortError') alert('Partage impossible : ' + err.message);
    }
  } else if (files.length === 1) {
    download(files[0], files[0].name);
  } else {
    await zipFiles(list);
  }
}

async function zipFiles(list) {
  const entries = {};
  for (const p of list) {
    entries[PhotoDB.fileName(p)] = [new Uint8Array(await p.blob.arrayBuffer()), { level: 0 }];
  }
  const data = fflate.zipSync(entries);
  const allConsent = list.every((p) => p.consent);
  const day = new Date().toISOString().slice(0, 10);
  download(new Blob([data], { type: 'application/zip' }), `photocall-${day}${allConsent ? '-publiables' : ''}.zip`);
}

async function removePhotos(list) {
  const msg = list.length === 1
    ? 'Supprimer définitivement cette photo de l’iPad ?'
    : `Supprimer définitivement ${list.length} photos de l’iPad ?`;
  if (!confirm(msg)) return;
  for (const p of list) {
    await PhotoDB.remove(p.id);
    selected.delete(p.id);
    if (urls.has(p.id)) URL.revokeObjectURL(urls.get(p.id));
    urls.delete(p.id);
  }
  load();
}

// ---------------------------------------------------------------------------
// Verrouillage par code
// ---------------------------------------------------------------------------
async function unlock(pin) {
  const res = await fetch('/api/admin-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
}

async function openApp() {
  $('#lock').hidden = true;
  $('#app').hidden = false;
  const persisted = await PhotoDB.persist();
  const standalone = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone;
  $('#persist-notice').hidden = persisted || standalone;
  load();
}

$('#lock-form').onsubmit = async (e) => {
  e.preventDefault();
  $('#lock-error').hidden = true;
  try {
    await unlock($('#pin').value);
    sessionStorage.setItem('photocall-admin', '1');
    openApp();
  } catch (err) {
    $('#lock-error').textContent = err.message;
    $('#lock-error').hidden = false;
  }
};

let unlocked = false;
try { unlocked = sessionStorage.getItem('photocall-admin') === '1'; } catch { /* stockage indisponible */ }
if (unlocked) openApp();

$('#only-consent').onchange = render;
$('#select-consent').onclick = () => {
  photos.filter((p) => p.consent).forEach((p) => selected.add(p.id));
  updateButtons();
};
$('#select-none').onclick = () => {
  selected.clear();
  updateButtons();
};
$('#share').onclick = () => shareFiles(selectedPhotos());
$('#zip').onclick = () => zipFiles(selectedPhotos());
$('#delete-selected').onclick = () => removePhotos(selectedPhotos());
$('#retry').onclick = async () => {
  $('#retry').disabled = true;
  const sent = await retryPendingMails();
  $('#retry').disabled = false;
  alert(sent ? `${sent} e-mail(s) envoyé(s).` : 'Aucun e-mail envoyé (pas de connexion ?).');
  load();
};
