/**
 * Auto-assignment of Matter bridge slots per user MAC.
 * Stores in DATA_PATH/bridge-assignments.json.
 * Slots are configured via MATTER_BRIDGE_SLOTS env var (JSON array of mgmtPort numbers).
 */

const fs     = require('fs');
const path   = require('path');

let FILE  = './data/bridge-assignments.json';
// Slots disponíveis (mgmtPorts dos bridges pré-provisionados no docker-compose)
let SLOTS = [];

function init(dataPath, slots) {
  FILE  = path.join(dataPath, 'bridge-assignments.json');
  SLOTS = slots;
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify({ assignments: [] }, null, 2));
}

function _load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { assignments: [] }; }
}

function _save(db) { fs.writeFileSync(FILE, JSON.stringify(db, null, 2)); }

// Retorna mgmtPort do bridge atribuído ao MAC, ou atribui um slot livre
function getOrAssign(mac) {
  if (!mac || SLOTS.length === 0) return null;
  const db = _load();
  const existing = db.assignments.find(a => a.mac === mac);
  if (existing) return existing.mgmtPort;

  // Pegar slots já usados
  const usedPorts = db.assignments.map(a => a.mgmtPort);
  const freePorts = SLOTS.filter(p => !usedPorts.includes(p));
  if (freePorts.length === 0) {
    console.warn(`[BridgeSlots] Todos os ${SLOTS.length} slots ocupados — MAC ${mac} sem bridge`);
    return null;
  }

  const mgmtPort = freePorts[0];
  db.assignments.push({ mac, mgmtPort, assignedAt: new Date().toISOString() });
  _save(db);
  console.log(`[BridgeSlots] MAC ${mac} → bridge mgmtPort ${mgmtPort}`);
  return mgmtPort;
}

function getMgmtPort(mac) {
  const db = _load();
  const a = db.assignments.find(a => a.mac === mac);
  return a ? a.mgmtPort : null;
}

function listAll() { return _load().assignments; }

module.exports = { init, getOrAssign, getMgmtPort, listAll };
