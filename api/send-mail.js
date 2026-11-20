'use strict';

// Envoie la photo par e-mail. La photo et l'adresse transitent uniquement
// en mémoire le temps de l'envoi : rien n'est enregistré sur le serveur.

const nodemailer = require('nodemailer');
const { config } = require('./_lib');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BYTES = 3.5 * 1024 * 1024; // limite des requêtes Vercel : 4,5 Mo

let transporter = null;
function getTransporter() {
  if (!transporter) {
    const { host, port, secure, user, pass } = config.smtp;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    });
  }
  return transporter;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }
  if (!config.mailEnabled) {
    return res.status(503).json({ error: "L'envoi d'e-mail n'est pas configuré." });
  }

  const { image, email, badges } = req.body || {};
  const to = typeof email === 'string' ? email.trim() : '';
  if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'Adresse e-mail invalide.' });

  const n = Number(badges);
  if (!Number.isInteger(n) || n < 0 || n > config.maxBadges) {
    return res.status(400).json({ error: 'Nombre de badges invalide.' });
  }

  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(image || '');
  if (!m) return res.status(400).json({ error: 'Image invalide.' });
  const content = Buffer.from(m[1], 'base64');
  if (content.length > MAX_BYTES) return res.status(413).json({ error: 'Image trop lourde.' });

  try {
    await getTransporter().sendMail({
      from: config.mailFrom,
      to,
      subject: config.mailSubject,
      text: config.mailText.replace(/\{badges\}/g, String(n)),
      attachments: [{ filename: 'photo-soiree-sante.jpg', content, contentType: 'image/jpeg' }],
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[send-mail] échec :', err.message);
    res.status(502).json({ error: "L'e-mail n'a pas pu être envoyé." });
  }
};
