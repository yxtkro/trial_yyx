const fs = require('fs');
const path = require('path');
const { LOG_FILE } = require('./config');

const mkdirp = () => {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const log = (message) => {
  mkdirp();
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] ${message}\n`;
  fs.appendFile(LOG_FILE, formatted, err => {
    if (err) console.error('Failed to write log:', err);
  });
};

module.exports = {
  log
};
