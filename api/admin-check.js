'use strict';

// Vérifie le code PIN de l'écran de gestion des photos (sur l'iPad).
// Le code n'est jamais envoyé au navigateur, il reste dans les variables Vercel.

const { config, checkPin } = require('./_lib');

module.exports = (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }
  if (!config.adminPin) {
    return res.status(503).json({ error: 'Définissez ADMIN_PIN dans les variables Vercel.' });
  }
  const { pin } = req.body || {};
  if (!checkPin(String(pin || ''))) return res.status(401).json({ error: 'Code incorrect.' });
  res.json({ ok: true });
};
