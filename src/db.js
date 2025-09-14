const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = path.resolve(__dirname, '../bot.db');

// Ensure DB file exists or create it
if (!fs.existsSync(DB_PATH)) {
  fs.closeSync(fs.openSync(DB_PATH, 'w'));
}

const db = new sqlite3.Database(DB_PATH);

// Initialize tables if not exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS trial_codes (
      code TEXT PRIMARY KEY,
      claimed_by INTEGER,
      claimed_at INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      claimed_code TEXT,
      accounts_used INTEGER DEFAULT 0,
      last_request_at INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER,
      user_id INTEGER,
      action TEXT,
      status TEXT,
      message TEXT
    )
  `);
});

// Wrapper functions

function getTrialCode(code) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM trial_codes WHERE code = ?', [code], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function insertTrialCode(code) {
  return new Promise((resolve, reject) => {
    db.run('INSERT OR IGNORE INTO trial_codes (code) VALUES (?)', [code], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function claimTrialCode(code, userId) {
  const now = Date.now();
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE trial_codes
       SET claimed_by = ?, claimed_at = ?
       WHERE code = ? AND claimed_by IS NULL`,
      [userId, now, code],
      function(err) {
        if (err) return reject(err);
        resolve(this.changes === 1);
      }
    );
  });
}

function getUser(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE telegram_id = ?', [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function createUser(userId, claimedCode) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO users (telegram_id, claimed_code, accounts_used, last_request_at) VALUES (?, ?, 0, 0)',
      [userId, claimedCode],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function updateUserAccountsUsed(userId, addCount) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET accounts_used = accounts_used + ? WHERE telegram_id = ?',
      [addCount, userId],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function setUserLastRequest(userId, timestamp) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET last_request_at = ? WHERE telegram_id = ?',
      [timestamp, userId],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function resetUserUsage(userId) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET accounts_used = 0, last_request_at = 0 WHERE telegram_id = ?',
      [userId],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function getAllUsers() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM users', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function logAction(userId, action, status, message = '') {
  const now = Date.now();
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO logs (timestamp, user_id, action, status, message) VALUES (?, ?, ?, ?, ?)',
      [now, userId, action, status, message],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function getLastLogs(limit = 50) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM logs ORDER BY id DESC LIMIT ?', [limit], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Pre-fill trial codes on startup
async function ensureTrialCodes(codes) {
  for (const code of codes) {
    await insertTrialCode(code);
  }
}

module.exports = {
  db,
  getTrialCode,
  claimTrialCode,
  getUser,
  createUser,
  updateUserAccountsUsed,
  setUserLastRequest,
  resetUserUsage,
  getAllUsers,
  logAction,
  getLastLogs,
  ensureTrialCodes,
};
