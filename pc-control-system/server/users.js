/**
 * User management for PC Control.
 * Stores users in DATA_PATH/users.json.
 * Passwords hashed with crypto.pbkdf2Sync (no external deps).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let DATA_PATH = './data';
let USERS_FILE = path.join(DATA_PATH, 'users.json');

function init(dataPath) {
  DATA_PATH = dataPath;
  USERS_FILE = path.join(DATA_PATH, 'users.json');
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
  }
}

function _load() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return { users: [] };
  }
}

function _save(db) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(db, null, 2));
}

function _hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function _randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── public API ──

function register(username, password) {
  const db = _load();
  const exists = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) return { error: 'Usuário já existe' };
  if (!username || username.length < 3) return { error: 'Username deve ter pelo menos 3 caracteres' };
  if (!password || password.length < 6) return { error: 'Senha deve ter pelo menos 6 caracteres' };

  const salt = crypto.randomBytes(16).toString('hex');
  const user = {
    id:           crypto.randomUUID(),
    username:     username.trim(),
    passwordHash: _hashPassword(password, salt),
    salt,
    token:        _randomToken(),
    createdAt:    new Date().toISOString(),
  };
  db.users.push(user);
  _save(db);
  return { token: user.token, username: user.username, id: user.id };
}

function login(username, password) {
  const db = _load();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return { error: 'Usuário não encontrado' };
  const hash = _hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return { error: 'Senha incorreta' };
  return { token: user.token, username: user.username, id: user.id };
}

function getByToken(token) {
  if (!token) return null;
  const db = _load();
  return db.users.find(u => u.token === token) || null;
}

function listAll() {
  return _load().users.map(u => ({
    id: u.id, username: u.username, createdAt: u.createdAt
  }));
}

module.exports = { init, register, login, getByToken, listAll };
