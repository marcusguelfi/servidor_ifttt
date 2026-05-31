const express    = require('express');
const cors       = require('cors');
const bodyParser = require('body-parser');
const WebSocket  = require('ws');
const fs         = require('fs');
const path       = require('path');
const http       = require('http');
const archiver   = require('archiver');

const users   = require('./users');
const customCmds = require('./custom-commands');

const app      = express();
const PORT     = process.env.PORT     || 3000;
const DATA_PATH = process.env.DATA_PATH || './data';
const API_KEY  = process.env.API_KEY  || '';
const SERVER_HOST = process.env.SERVER_HOST || `http://localhost:${PORT}`;
// URL que o cliente usa para conectar via WebSocket (enviada no zip de download)
const CLIENT_WS_URL = process.env.CLIENT_WS_URL || `ws://192.168.0.225:${PORT}`;
// Porta do management HTTP da matter-bridge
const MATTER_MGMT_PORT = parseInt(process.env.MATTER_MGMT_PORT || '5541', 10);
// Host da matter-bridge — em Docker Linux, usar host-gateway para alcançar container em network_mode:host
const MATTER_MGMT_HOST = process.env.MATTER_MGMT_HOST || 'host.docker.internal';

// Inicializar storage
if (!fs.existsSync(DATA_PATH)) fs.mkdirSync(DATA_PATH, { recursive: true });
users.init(DATA_PATH);
customCmds.init(DATA_PATH);

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
        connectedPCs.set(data.macAddress, {
          ws,
          macAddress: data.macAddress,
          ip:         data.ip,
          hostname:   data.hostname,
          userId:     user ? user.id : null,
          username:   user ? user.username : null,
          lastSeen:   Date.now(),
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

  // Adicionar todos os arquivos do cliente (exceto __pycache__)
  zip.glob('**/*', {
    cwd: clientDir,
    ignore: ['**/__pycache__/**', '**/*.pyc', '**/config.json'],
  });

  zip.finalize();
});

// ────────────────────────────────────────────────────────
// Matter Bridge — proxy do management HTTP (porta 5541)
// ────────────────────────────────────────────────────────

function _matterRequest(method, urlPath, res) {
  const options = { hostname: MATTER_MGMT_HOST, port: MATTER_MGMT_PORT, path: urlPath, method };
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

app.get('/api/matter/status',  (_, res) => _matterRequest('GET',  '/status', res));
app.post('/api/matter/reset',  (_, res) => _matterRequest('POST', '/reset',  res));

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
