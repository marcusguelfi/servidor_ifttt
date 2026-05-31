/**
 * Custom commands storage.
 * Stored in DATA_PATH/custom-commands.json.
 * Commands are global (visible to all users, editable by creator).
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

let FILE = './data/custom-commands.json';

function init(dataPath) {
  FILE = path.join(dataPath, 'custom-commands.json');
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ commands: [] }, null, 2));
}

function _load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { commands: [] }; }
}

function _save(db) { fs.writeFileSync(FILE, JSON.stringify(db, null, 2)); }

function list() { return _load().commands; }

function add(userId, username, label, command, params = {}) {
  if (!label || !command) return { error: 'label e command são obrigatórios' };
  const db = _load();
  const entry = {
    id:       crypto.randomUUID(),
    userId,
    username,
    label,
    command,
    params,
    createdAt: new Date().toISOString(),
  };
  db.commands.push(entry);
  _save(db);
  return entry;
}

function remove(id, userId) {
  const db = _load();
  const idx = db.commands.findIndex(c => c.id === id && c.userId === userId);
  if (idx === -1) return { error: 'Comando não encontrado ou sem permissão' };
  db.commands.splice(idx, 1);
  _save(db);
  return { success: true };
}

module.exports = { init, list, add, remove };
