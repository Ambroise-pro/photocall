'use strict';

// ---------------------------------------------------------------------------
// Géométrie du cadre (en pixels de l'image cadre.webp, 1536 x 1024)
// ---------------------------------------------------------------------------
const FRAME = {
  width: 1536,
  height: 1024,
  // Zone où la photo est dessinée (un peu plus grande que la fenêtre
  // transparente du cadre, pour qu'il n'y ait aucun liseré blanc).
  photo: { x: 166, y: 196, w: 1202, h: 634 },
  // Emplacement en pointillés "badges validés sur la soirée !"
  slot: { cx: 1027, cy: 885, w: 250, h: 100 },
  textColor: '#1d2a78',
};

const COLORS = ['#f7a417', '#e5322d', '#5cb83a', '#1f9be0', '#1d3f9e', '#15a6a0', '#f2b21b', '#8e3bb0'];
const COUNTDOWN = 3;
const IDLE_RESET_MS = 120 * 1000;

const $ = (sel) => document.querySelector(sel);
const state = { config: { maxBadges: 8, mirror: true, mailEnabled: false }, badges: null, stream: null, raf: 0, photo: null, busy: false };

const frameImg = new Image();
frameImg.src = 'assets/cadre.webp';
const video = document.createElement('video');
video.muted = true;
video.playsInline = true;

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function show(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
}

function resetAll() {
  stopCamera();
  state.badges = null;
  state.photo = null;
  state.busy = false;
  $('#consent').checked = false;
  $('#email').value = '';
  $('#form-error').hidden = true;
  $('#countdown').textContent = '';
  renderBadgeGrid();
  show('screen-home');
}

// Retour automatique à l'accueil si la borne reste inactive
let idleTimer = 0;
function bumpIdle() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!$('#screen-home').classList.contains('active') && !state.busy) resetAll();
  }, IDLE_RESET_MS);
}
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, bumpIdle, true));

// ---------------------------------------------------------------------------
// Accueil : choix du nombre de badges
// ---------------------------------------------------------------------------
function renderBadgeGrid() {
  const grid = $('#badge-grid');
  grid.innerHTML = '';
  grid.classList.toggle('has-choice', state.badges !== null);
  for (let i = 0; i <= state.config.maxBadges; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'badge-btn';
    b.textContent = i;
    b.style.setProperty('--c', COLORS[(i + COLORS.length - 1) % COLORS.length]);
    b.setAttribute('aria-pressed', String(state.badges === i));
    b.setAttribute('aria-label', `${i} badge${i > 1 ? 's' : ''}`);
    b.addEventListener('click', () => {
      state.badges = i;
      renderBadgeGrid();
    });
    grid.appendChild(b);
  }
  $('#btn-start').disabled = state.badges === null;
}

// ---------------------------------------------------------------------------
// Composition de l'image : photo + cadre + nombre de badges
// ---------------------------------------------------------------------------
function drawCover(ctx, src, sw, sh, box, mirror) {
  const scale = Math.max(box.w / sw, box.h / sh);
  const cw = box.w / scale;
  const ch = box.h / scale;
  const sx = (sw - cw) / 2;
  const sy = (sh - ch) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  if (mirror) {
    ctx.translate(box.x * 2 + box.w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(src, sx, sy, cw, ch, box.x, box.y, box.w, box.h);
  ctx.restore();
}

function drawBadgeCount(ctx, n) {
  const { cx, cy, w } = FRAME.slot;
  const text = String(n);
  let size = 104;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  do {
    ctx.font = `800 ${size}px "Baloo 2", system-ui, sans-serif`;
    size -= 4;
  } while (ctx.measureText(text).width > w - 30 && size > 30);
  const m = ctx.measureText(text);
  // centrage vertical sur la hauteur réelle des chiffres
  const asc = m.actualBoundingBoxAscent || size * 0.7;
  const desc = m.actualBoundingBoxDescent || 0;
  const y = cy + (asc - desc) / 2;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeText(text, cx, y);
  ctx.fillStyle = FRAME.textColor;
  ctx.fillText(text, cx, y);
  ctx.restore();
}

function compose(ctx, source, sw, sh, badges) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, FRAME.width, FRAME.height);
  if (source && sw && sh) drawCover(ctx, source, sw, sh, FRAME.photo, state.config.mirror);
  if (frameImg.complete) ctx.drawImage(frameImg, 0, 0, FRAME.width, FRAME.height);
  drawBadgeCount(ctx, badges);
}

// ---------------------------------------------------------------------------
// Caméra
// ---------------------------------------------------------------------------
async function startCamera() {
  $('#camera-error').hidden = true;
  $('#btn-shoot').disabled = true;
  show('screen-camera');
  try {
    if (!state.stream) {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' },
        audio: false,
      });
    }
    video.srcObject = state.stream;
    await video.play();
    $('#btn-shoot').disabled = false;
  } catch (err) {
    console.error(err);
    const msg = !window.isSecureContext
      ? "La caméra n'est accessible qu'en HTTPS ou via http://localhost."
      : "Impossible d'accéder à la caméra. Vérifiez qu'elle est branchée et autorisée dans le navigateur.";
    $('#camera-error').textContent = msg;
    $('#camera-error').hidden = false;
  }
  const ctx = $('#live').getContext('2d');
  const loop = () => {
    compose(ctx, video, video.videoWidth, video.videoHeight, state.badges);
    state.raf = requestAnimationFrame(loop);
  };
  cancelAnimationFrame(state.raf);
  loop();
}

function stopCamera() {
  cancelAnimationFrame(state.raf);
  if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
  state.stream = null;
  video.srcObject = null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shoot() {
  if (state.busy) return;
  state.busy = true;
  $('#btn-shoot').disabled = true;
  $('#btn-back').disabled = true;
  const cd = $('#countdown');
  for (let i = COUNTDOWN; i > 0; i--) {
    cd.textContent = i;
    cd.classList.remove('tick');
    void cd.offsetWidth;
    cd.classList.add('tick');
    await wait(1000);
  }
  cd.textContent = '';

  const canvas = document.createElement('canvas');
  canvas.width = FRAME.width;
  canvas.height = FRAME.height;
  compose(canvas.getContext('2d'), video, video.videoWidth, video.videoHeight, state.badges);
  state.photo = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
  state.photoUrl = URL.createObjectURL(state.photo);

  const flash = $('#flash');
  flash.classList.remove('on');
  void flash.offsetWidth;
  flash.classList.add('on');
  await wait(450);

  cancelAnimationFrame(state.raf);
  $('#result').src = state.photoUrl;
  $('#btn-shoot').disabled = false;
  $('#btn-back').disabled = false;
  state.busy = false;
  show('screen-review');
}

// ---------------------------------------------------------------------------
// Validation et envoi
// ---------------------------------------------------------------------------
async function validate(e) {
  e.preventDefault();
  if (state.busy) return;
  const err = $('#form-error');
  err.hidden = true;
  const email = $('#email').value.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    err.textContent = "L'adresse e-mail ne semble pas valide.";
    err.hidden = false;
    return;
  }

  state.busy = true;
  const btn = $('#btn-validate');
  btn.disabled = true;
  btn.textContent = 'Envoi…';
  try {
    const wantMail = Boolean(email && state.config.mailEnabled);
    const record = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      createdAt: new Date().toISOString(),
      badges: state.badges,
      consent: $('#consent').checked,
      blob: state.photo,
      mail: wantMail ? 'en attente' : 'non demandé',
    };
    // 1. Enregistrement sur l'iPad (avant tout envoi réseau)
    await PhotoDB.put(record);

    // 2. Envoi éventuel par e-mail
    let mailResult = 'none';
    if (wantMail) {
      btn.textContent = 'Envoi de l’e-mail…';
      try {
        await sendPhotoMail(record.blob, email, record.badges);
        record.mail = 'envoyé';
        mailResult = 'sent';
      } catch (ex) {
        if (ex.permanent) {
          record.mail = 'échec';
          mailResult = 'failed';
        } else {
          record.pendingEmail = email; // réessayé automatiquement plus tard
          mailResult = 'queued';
        }
      }
      await PhotoDB.put(record);
    }

    const n = state.badges;
    const parts = [`Bravo pour vos ${n} badge${n > 1 ? 's' : ''} validé${n > 1 ? 's' : ''} !`];
    if (mailResult === 'sent') parts.push('La photo vient de vous être envoyée par e-mail.');
    else if (mailResult === 'queued') parts.push('La photo vous sera envoyée par e-mail dès que la connexion le permettra.');
    else if (mailResult === 'failed') parts.push("L'e-mail n'a pas pu être envoyé, vérifiez l'adresse auprès de l'équipe.");
    parts.push($('#consent').checked
      ? 'Merci pour votre accord de publication.'
      : 'Votre photo ne sera pas publiée sur les réseaux sociaux.');
    $('#done-msg').textContent = parts.join(' ');
    stopCamera();
    show('screen-done');
    state.busy = false;
    setTimeout(() => { if ($('#screen-done').classList.contains('active')) resetAll(); }, 10000);
  } catch (ex) {
    err.textContent = `Oups, la photo n'a pas pu être enregistrée (${ex.message}). Réessayez.`;
    err.hidden = false;
    state.busy = false;
  } finally {
    btn.disabled = false;
    btn.textContent = '✔ Valider';
  }
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
$('#btn-start').addEventListener('click', () => state.badges !== null && startCamera());
$('#btn-back').addEventListener('click', resetAll);
$('#btn-shoot').addEventListener('click', shoot);
$('#btn-retake').addEventListener('click', startCamera);
$('#review-form').addEventListener('submit', validate);
$('#btn-new').addEventListener('click', resetAll);
$('#btn-fullscreen').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
document.addEventListener('keydown', (e) => {
  // Barre d'espace / Entrée = déclencheur (utile avec une télécommande ou un gros bouton USB)
  if ((e.key === ' ' || e.key === 'Enter') && $('#screen-camera').classList.contains('active')) {
    e.preventDefault();
    if (!$('#btn-shoot').disabled) shoot();
  }
});

// Empêche la mise en veille de l'écran pendant la soirée
async function keepAwake() {
  try { await navigator.wakeLock?.request('screen'); } catch { /* non supporté */ }
}
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && keepAwake());

(async function init() {
  try {
    const res = await fetch('api/config');
    if (res.ok) state.config = { ...state.config, ...(await res.json()) };
  } catch { /* valeurs par défaut */ }
  $('#mail-block').hidden = !state.config.mailEnabled;
  document.fonts?.load('800 100px "Baloo 2"');
  renderBadgeGrid();
  keepAwake();
  PhotoDB.persist();
  retryPendingMails();
})();
window.addEventListener('online', () => retryPendingMails());
setInterval(() => retryPendingMails(), 2 * 60 * 1000);
