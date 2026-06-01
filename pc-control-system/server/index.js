const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const WebSocket  = require('ws');
const fs         = require('fs');
const path       = require('path');
const http       = require('http');
const archiver   = require('archiver');

const users          = require('./users');
const customCmds     = require('./custom-commands');
const bridgeSlots    = require('./bridge-assignments');

const app      = express();
const PORT     = process.env.PORT     || 3000;
const DATA_PATH = process.env.DATA_PATH || './data';
const API_KEY  = process.env.API_KEY  || '';
const SERVER_HOST = process.env.SERVER_HOST || `http://localhost:${PORT}`;
// URL que o cliente usa para conectar via WebSocket (enviada no zip de download)
const CLIENT_WS_URL = process.env.CLIENT_WS_URL || `ws://192.168.0.225:${PORT}`;
// Host dos bridges Matter (network_mode:host → via host-gateway)
const MATTER_MGMT_HOST = process.env.MATTER_MGMT_HOST || 'host.docker.internal';
// Mapa MAC → porta mgmt: [{"mac":"AA:BB:...","mgmtPort":5541},...]
// Fallback: porta única legacy
const MATTER_BRIDGES_RAW = process.env.MATTER_BRIDGES || '[]';
let MATTER_BRIDGES = [];
try { MATTER_BRIDGES = JSON.parse(MATTER_BRIDGES_RAW); } catch (_) {}
const MATTER_MGMT_PORT_DEFAULT = parseInt(process.env.MATTER_MGMT_PORT || '5541', 10);

function getMgmtPortForMac(mac) {
  // 1. Verificar slot auto-atribuído (bridge-assignments.js)
  if (mac) {
    const assigned = bridgeSlots.getMgmtPort(mac);
    if (assigned) return assigned;
  }
  // 2. Fallback: mapa estático via env var MATTER_BRIDGES
  if (MATTER_BRIDGES.length > 0) {
    const bridge = MATTER_BRIDGES.find(b => b.mac === mac);
    if (bridge) return bridge.mgmtPort;
    return MATTER_BRIDGES[0].mgmtPort;
  }
  // 3. Fallback legacy
  return MATTER_MGMT_PORT_DEFAULT;
}

// Inicializar storage
if (!fs.existsSync(DATA_PATH)) fs.mkdirSync(DATA_PATH, { recursive: true });
users.init(DATA_PATH);
customCmds.init(DATA_PATH);

// Slots de bridges pré-provisionados no docker-compose
// Ex: MATTER_BRIDGE_SLOTS=[5541,5543,5545] — um slot por bridge disponível
const MATTER_BRIDGE_SLOTS = JSON.parse(process.env.MATTER_BRIDGE_SLOTS || '[]');
bridgeSlots.init(DATA_PATH, MATTER_BRIDGE_SLOTS);

// Middleware
app.use(cors());
app.use(bodyParser.json());

const webDir = fs.existsSync(path.join(__dirname, 'web'))
  ? path.join(__dirname, 'web')
  : path.join(__dirname, '../web');
app.use(express.static(webDir));

// Storage runtime
const connectedPCs      = new Map(); // mac → { ws, macAddress, ip, hostname, lastSeen, userId }
const systemInfoCache   = new Map(); // mac → systemInfo
const audioDevicesCache = new Map(); // mac → [devices]

// ── middleware de API key legada (opcional) ──
function authMiddleware(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers['x-api-key'] || req.query.apikey;
  if (key === API_KEY) return next();
  res.status(401).json({ success: false, error: 'API key inválida' });
}

// ── helper: pegar userId do header x-user-token ──
function getUserFromReq(req) {
  const token = req.headers['x-user-token'] || req.query.usertoken;
  return token ? users.getByToken(token) : null;
}

// ────────────────────────────────────────────────────────
// WebSocket
// ────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);

      if (data.type === 'register') {
        const user = users.getByToken(data.token);
        // Auto-atribuir slot de bridge Matter a este MAC
        const bridgeMgmtPort = bridgeSlots.getOrAssign(data.macAddress);
        connectedPCs.set(data.macAddress, {
          ws,
          macAddress:      data.macAddress,
          ip:              data.ip,
          hostname:        data.hostname,
          userId:          user ? user.id : null,
          username:        user ? user.username : null,
          bridgeMgmtPort,
          lastSeen:        Date.now(),
        });
        if (data.systemInfo)   systemInfoCache.set(data.macAddress, data.systemInfo);
        if (data.audioDevices) audioDevicesCache.set(data.macAddress, data.audioDevices);
        console.log(`PC registrado: ${data.hostname} (${data.macAddress}) user=${user?.username || 'anon'}`);
        ws.send(JSON.stringify({ type: 'registered', success: true }));

      } else if (data.type === 'heartbeat') {
        const pc = connectedPCs.get(data.macAddress);
        if (pc) {
          pc.lastSeen = Date.now();
          pc.ip = data.ip;
          if (data.systemInfo)   systemInfoCache.set(data.macAddress, data.systemInfo);
          if (data.audioDevices) audioDevicesCache.set(data.macAddress, data.audioDevices);
        }

      } else if (data.type === 'command-feedback') {
        console.log(`Feedback [${data.command}]: ${data.success ? 'OK' : 'ERRO'} — ${data.message}`);
      }
    } catch (e) {
      console.error('Erro ao processar WS:', e.message);
    }
  });

  ws.on('close', () => {
    for (const [mac, pc] of connectedPCs.entries()) {
      if (pc.ws === ws) {
        console.log(`PC desconectado: ${pc.hostname}`);
        connectedPCs.delete(mac);
        break;
      }
    }
  });
});

function sendCommandToPC(macAddress, command, params = {}) {
  const pc = connectedPCs.get(macAddress);
  if (!pc || !pc.ws || pc.ws.readyState !== WebSocket.OPEN)
    return { success: false, error: 'PC não conectado' };
  try {
    pc.ws.send(JSON.stringify({ type: 'command', command, params, timestamp: Date.now() }));
    return { success: true, message: 'Comando enviado' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function getFirstMAC(userId = null) {
  for (const [mac, pc] of connectedPCs.entries()) {
    if (userId === null || pc.userId === userId) return mac;
  }
  return null;
}

// ────────────────────────────────────────────────────────
// Auth routes
// ────────────────────────────────────────────────────────

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body || {};
  const result = users.register(username, password);
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, token: result.token, username: result.username });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const result = users.login(username, password);
  if (result.error) return res.status(401).json({ success: false, error: result.error });
  res.json({ success: true, token: result.token, username: result.username });
});

app.get('/api/me', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ success: false, error: 'Não autenticado' });
  const pcs = Array.from(connectedPCs.values())
    .filter(pc => pc.userId === user.id)
    .map(pc => ({
      macAddress: pc.macAddress,
      ip:         pc.ip,
      hostname:   pc.hostname,
      lastSeen:   pc.lastSeen,
      online:     (Date.now() - pc.lastSeen) < 30000,
    }));
  res.json({ success: true, username: user.username, pcs });
});

// ────────────────────────────────────────────────────────
// Custom Commands
// ────────────────────────────────────────────────────────

// Listar (público — Matter bridge também usa sem auth)
app.get('/api/custom-commands', (req, res) => {
  res.json({ commands: customCmds.list() });
});

// Criar (requer token)
app.post('/api/custom-commands', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ success: false, error: 'Não autenticado' });
  const { label, command, params } = req.body || {};
  const result = customCmds.add(user.id, user.username, label, command, params || {});
  if (result.error) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, command: result });
});

// Deletar (requer token + ser dono)
app.delete('/api/custom-commands/:id', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ success: false, error: 'Não autenticado' });
  const result = customCmds.remove(req.params.id, user.id);
  if (result.error) return res.status(404).json({ success: false, error: result.error });
  res.json({ success: true });
});

// ────────────────────────────────────────────────────────
// PC listing & info
// ────────────────────────────────────────────────────────

app.get('/api/pcs', (req, res) => {
  const user = getUserFromReq(req);
  const all = Array.from(connectedPCs.values());
  // Com token: retorna só PCs do usuário. Sem token: retorna todos (legacy/admin)
  const filtered = user ? all.filter(pc => pc.userId === user.id) : all;
  res.json(filtered.map(pc => ({
    macAddress: pc.macAddress,
    ip:         pc.ip,
    hostname:   pc.hostname,
    lastSeen:   pc.lastSeen,
    online:     (Date.now() - pc.lastSeen) < 30000,
  })));
});

app.get('/api/system-info/:macAddress', (req, res) => {
  res.json(systemInfoCache.get(req.params.macAddress) || {});
});

app.get('/api/devices/:macAddress', (req, res) => {
  res.json(audioDevicesCache.get(req.params.macAddress) || []);
});

// Audio devices do primeiro PC conectado (usado pelo matter-bridge para descoberta dinâmica)
app.get('/api/audio-devices', (req, res) => {
  const mac = getFirstMAC();
  if (!mac) return res.json([]);
  res.json(audioDevicesCache.get(mac) || []);
});

// ────────────────────────────────────────────────────────
// Command routes (mantém compatibilidade com webhooks IFTTT)
// ────────────────────────────────────────────────────────

app.post('/api/webhook/:macAddress/:command', authMiddleware, (req, res) => {
  const { macAddress, command } = req.params;
  console.log(`Webhook: ${command} → ${macAddress}`);
  res.json(sendCommandToPC(macAddress, command, req.body || {}));
});

app.post('/api/command/:command', authMiddleware, (req, res) => {
  const user = getUserFromReq(req);
  const mac  = getFirstMAC(user?.id ?? null);
  if (!mac) return res.json({ success: false, error: 'Nenhum PC conectado' });
  console.log(`Comando: ${req.params.command} → ${mac}`);
  res.json(sendCommandToPC(mac, req.params.command, req.body || {}));
});

app.post('/api/command', authMiddleware, (req, res) => {
  const { macAddress, command, params } = req.body || {};
  const user = getUserFromReq(req);
  const mac  = macAddress || getFirstMAC(user?.id ?? null);
  if (!mac) return res.json({ success: false, error: 'Nenhum PC conectado' });
  console.log(`API: ${command} → ${mac}`);
  res.json(sendCommandToPC(mac, command, params || {}));
});

// Rota legada
app.post('/api/command/:macAddress', authMiddleware, (req, res) => {
  const { macAddress } = req.params;
  const { command, params } = req.body || {};
  if (!command) {
    const mac = getFirstMAC();
    if (!mac) return res.json({ success: false, error: 'Nenhum PC conectado' });
    return res.json(sendCommandToPC(mac, macAddress, params || {}));
  }
  res.json(sendCommandToPC(macAddress, command, params || {}));
});

// ────────────────────────────────────────────────────────
// Download do cliente Python
// ────────────────────────────────────────────────────────

app.get('/api/download/client', (req, res) => {
  const user  = getUserFromReq(req);
  const token = user?.token || '';
  const clientDir = path.join(__dirname, 'client');

  if (!fs.existsSync(clientDir)) {
    return res.status(404).json({ error: 'Arquivos do cliente não encontrados no servidor.' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="pc-control-client.zip"');

  const zip = archiver('zip', { zlib: { level: 6 } });
  zip.on('error', err => { console.error('Zip error:', err); res.end(); });
  zip.pipe(res);

  // Injetar config.json com URL do servidor e token do usuário
  const config = JSON.stringify({
    server_url: CLIENT_WS_URL.replace(/^http/, 'ws').replace(/^https/, 'wss'),
    user_token: token,
  }, null, 2);
  zip.append(config, { name: 'config.json' });

  // Gerar run_client.vbs dinamicamente (evita corrupção de encoding no archiver)
  // VBScript precisa de encoding ASCII e aspas exatas — não confiar no arquivo do disco
  const vbsContent =
    'Set WshShell = CreateObject("WScript.Shell")\r\n' +
    'WshShell.Run "python """ & Replace(WScript.ScriptFullName, "run_client.vbs", "pc_client.py") & """", 0, False\r\n';
  zip.append(Buffer.from(vbsContent, 'ascii'), { name: 'run_client.vbs' });

  // Adicionar demais arquivos do cliente (exceto os gerados acima e __pycache__)
  zip.glob('**/*', {
    cwd: clientDir,
    ignore: ['**/__pycache__/**', '**/*.pyc', '**/config.json', '**/run_client.vbs'],
  });

  zip.finalize();
});

// ────────────────────────────────────────────────────────
// Matter Bridge — proxy do management HTTP (porta 5541)
// ────────────────────────────────────────────────────────

function _matterRequest(method, urlPath, res, port) {
  const options = { hostname: MATTER_MGMT_HOST, port, path: urlPath, method };
  const req = http.request(options, (matterRes) => {
    let body = '';
    matterRes.on('data', d => body += d);
    matterRes.on('end', () => {
      try { res.json(JSON.parse(body)); }
      catch { res.json({ raw: body }); }
    });
  });
  req.on('error', () => res.json({ error: 'Matter bridge não disponível' }));
  req.end();
}

// Retorna status do bridge do usuário logado (pelo MAC do PC dele)
app.get('/api/matter/status', (req, res) => {
  const user = getUserFromReq(req);
  let mac = req.query.mac || '';
  if (!mac && user) {
    for (const [m, pc] of connectedPCs.entries()) {
      if (pc.userId === user.id) { mac = m; break; }
    }
  }
  _matterRequest('GET', '/status', res, getMgmtPortForMac(mac));
});

// Reset do bridge do usuário logado
app.post('/api/matter/reset', (req, res) => {
  const user = getUserFromReq(req);
  let mac = '';
  if (user) {
    for (const [m, pc] of connectedPCs.entries()) {
      if (pc.userId === user.id) { mac = m; break; }
    }
  }
  _matterRequest('POST', '/reset', res, getMgmtPortForMac(mac));
});

// ────────────────────────────────────────────────────────
// Health check
// ────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', connectedPCs: connectedPCs.size, timestamp: Date.now() });
});

// ────────────────────────────────────────────────────────
// Servidor HTTP + WebSocket upgrade
// ────────────────────────────────────────────────────────

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`PC Control rodando em http://0.0.0.0:${PORT}`);
  if (API_KEY) console.log('API Key ativa');
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
});

// Limpar PCs inativos
setInterval(() => {
  const now = Date.now();
  for (const [mac, pc] of connectedPCs.entries()) {
    if (now - pc.lastSeen > 60000) {
      console.log(`PC inativo removido: ${pc.hostname}`);
      connectedPCs.delete(mac);
    }
  }
}, 60000);

console.log('PC Control System inicializado!');
