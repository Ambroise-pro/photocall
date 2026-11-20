'use strict';

// Code partagé par les fonctions serverless (les fichiers commençant par "_"
// ne sont pas exposés comme routes par Vercel).
// AUCUNE photo n'est stockée côté serveur : elles restent sur l'iPad.

const crypto = require('crypto');

const smtp = {
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: (process.env.SMTP_SECURE || 'true') === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
};

const config = {
  maxBadges: parseInt(process.env.MAX_BADGES || '8', 10),
  mirror: process.env.MIRROR !== 'false',
  adminPin: process.env.ADMIN_PIN || '',
  smtp,
  mailFrom: process.env.MAIL_FROM || smtp.user,
  mailSubject: process.env.MAIL_SUBJECT || 'Votre photo de la soirée santé 📸',
  mailText:
    process.env.MAIL_TEXT ||
    'Bonjour,\n\nMerci pour votre participation à la soirée santé !\n' +
      'Vous trouverez en pièce jointe votre photo souvenir avec {badges} badge(s) validé(s).\n\n' +
      'Promouvoir, prévenir, accompagner : agissons ensemble pour notre santé !\n',
};
config.mailEnabled = Boolean(smtp.host && config.mailFrom);

function checkPin(pin) {
  if (!config.adminPin || typeof pin !== 'string') return false;
  const a = crypto.createHash('sha256').update(pin).digest();
  const b = crypto.createHash('sha256').update(config.adminPin).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { config, checkPin };
