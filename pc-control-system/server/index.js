const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = process.env.DATA_PATH || './data';
const API_KEY = process.env.API_KEY || '';

// Middleware
app.use(cors());
app.use(bodyParser.json());
// Em Docker: /app/web, em dev local: ../web
const webDir = fs.existsSync(path.join(__dirname, 'web'))
  ? path.join(__dirname, 'web')
  : path.join(__dirname, '../web');
app.use(express.static(webDir));

// Storage para PCs conectados
let connectedPCs = new Map();
// Cache de system info e audio devices
let systemInfoCache = new Map();
let audioDevicesCache = new Map();

// Criar diretório de dados se não existir
if (!fs.existsSync(DATA_PATH)) {
  fs.mkdirSync(DATA_PATH, { recursive: true });
}

// Middleware de autenticação (opcional)
function authMiddleware(req, res, next) {
  if (!API_KEY) return next();

  const key = req.headers['x-api-key'] || req.query.apikey;
  if (key === API_KEY) return next();

  res.status(401).json({ success: false, error: 'API key inválida' });
}

// Configuração do WebSocket
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws, req) => {
  console.log('Cliente conectado');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'register') {
        connectedPCs.set(data.macAddress, {
          ws: ws,
          macAddress: data.macAddress,
          ip: data.ip,
          hostname: data.hostname,
          lastSeen: Date.now()
        });

        // Cache de dados
        if (data.systemInfo) {
          systemInfoCache.set(data.macAddress, data.systemInfo);
        }
        if (data.audioDevices) {
          audioDevicesCache.set(data.macAddress, data.audioDevices);
        }

        console.log(`PC registrado: ${data.hostname} (${data.macAddress}) - IP: ${data.ip}`);

        ws.send(JSON.stringify({ type: 'registered', success: true }));

      } else if (data.type === 'heartbeat') {
        const pc = connectedPCs.get(data.macAddress);
        if (pc) {
          pc.lastSeen = Date.now();
          pc.ip = data.ip;
        }
        // Atualizar caches
        if (data.systemInfo) {
          systemInfoCache.set(data.macAddress, data.systemInfo);
        }
        if (data.audioDevices) {
          audioDevicesCache.set(data.macAddress, data.audioDevices);
        }

      } else if (data.type === 'command-feedback') {
        console.log(`Feedback: ${data.command} - ${data.success ? 'OK' : 'ERRO'}: ${data.message}`);
      }
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
    }
  });

  ws.on('close', () => {
    for (let [mac, pc] of connectedPCs.entries()) {
      if (pc.ws === ws) {
        console.log(`PC desconectado: ${pc.hostname}`);
        connectedPCs.delete(mac);
        break;
      }
    }
  });
});

// Função para enviar comando
function sendCommandToPC(macAddress, command, params = {}) {
  const pc = connectedPCs.get(macAddress);

  if (!pc || !pc.ws || pc.ws.readyState !== WebSocket.OPEN) {
    return { success: false, error: 'PC não conectado' };
  }

  try {
    pc.ws.send(JSON.stringify({
      type: 'command',
      command: command,
      params: params,
      timestamp: Date.now()
    }));
    return { success: true, message: 'Comando enviado' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Helper: pegar primeiro MAC conectado (para webhooks sem MAC)
function getFirstMAC() {
  const first = connectedPCs.keys().next();
  return first.value || null;
}

// ==== ROTAS DA API ====

// Listar PCs conectados
app.get('/api/pcs', (req, res) => {
  const pcs = Array.from(connectedPCs.values()).map(pc => ({
    macAddress: pc.macAddress,
    ip: pc.ip,
    hostname: pc.hostname,
    lastSeen: pc.lastSeen,
    online: (Date.now() - pc.lastSeen) < 30000
  }));
  res.json(pcs);
});

// System info
app.get('/api/system-info/:macAddress', (req, res) => {
  const info = systemInfoCache.get(req.params.macAddress);
  if (info) {
    res.json(info);
  } else {
    res.json({});
  }
});

// Audio devices
app.get('/api/devices/:macAddress', (req, res) => {
  const devices = audioDevicesCache.get(req.params.macAddress);
  if (devices) {
    res.json(devices);
  } else {
    res.json([]);
  }
});

// Webhook genérico (com MAC)
app.post('/api/webhook/:macAddress/:command', authMiddleware, (req, res) => {
  const { macAddress, command } = req.params;
  const params = req.body || {};

  console.log(`Webhook: ${command} para ${macAddress}`);
  const result = sendCommandToPC(macAddress, command, params);
  res.json(result);
});

// Webhook sem MAC (usa primeiro PC conectado)
app.post('/api/command/:command', authMiddleware, (req, res) => {
  const { command } = req.params;
  const params = req.body || {};
  const mac = getFirstMAC();

  if (!mac) {
    return res.json({ success: false, error: 'Nenhum PC conectado' });
  }

  console.log(`Comando: ${command} para ${mac}`);
  const result = sendCommandToPC(mac, command, params);
  res.json(result);
});

// Rota de comando com MAC no body (para web app)
app.post('/api/command', authMiddleware, (req, res) => {
  const { macAddress, command, params } = req.body;
  const mac = macAddress || getFirstMAC();

  if (!mac) {
    return res.json({ success: false, error: 'Nenhum PC conectado' });
  }

  console.log(`API: ${command} para ${mac}`);
  const result = sendCommandToPC(mac, command, params || {});
  res.json(result);
});

// Rota legada (compatibilidade com dashboard antigo)
app.post('/api/command/:macAddress', authMiddleware, (req, res) => {
  const { macAddress } = req.params;
  const { command, params } = req.body;

  if (!command) {
    // Se não tem command no body, o macAddress é na verdade o command
    const mac = getFirstMAC();
    if (!mac) return res.json({ success: false, error: 'Nenhum PC conectado' });
    const result = sendCommandToPC(mac, macAddress, params || {});
    return res.json(result);
  }

  const result = sendCommandToPC(macAddress, command, params || {});
  res.json(result);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    connectedPCs: connectedPCs.size,
    timestamp: Date.now()
  });
});

// Página inicial
app.get('/', (req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
  if (API_KEY) console.log('API Key ativa');
});

// WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Limpar PCs inativos
setInterval(() => {
  const now = Date.now();
  for (let [mac, pc] of connectedPCs.entries()) {
    if (now - pc.lastSeen > 60000) {
      console.log(`PC inativo removido: ${pc.hostname}`);
      connectedPCs.delete(mac);
    }
  }
}, 60000);

console.log('PC Control System inicializado!');
