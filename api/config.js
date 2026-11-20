'use strict';

const { config } = require('./_lib');

module.exports = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    maxBadges: config.maxBadges,
    mirror: config.mirror,
    mailEnabled: config.mailEnabled,
    adminEnabled: Boolean(config.adminPin),
  });
};
