const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = process.env.DATA_PATH || './data';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../web')));

// Storage para PCs conectados
let connectedPCs = new Map();

// Criar diretório de dados se não existir
if (!fs.existsSync(DATA_PATH)) {
  fs.mkdirSync(DATA_PATH, { recursive: true });
}

// Configuração do WebSocket
const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws, req) => {
  console.log('Cliente conectado');
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'register') {
        // Registrar PC
        connectedPCs.set(data.macAddress, {
          ws: ws,
          macAddress: data.macAddress,
          ip: data.ip,
          hostname: data.hostname,
          lastSeen: Date.now()
        });
        
        console.log(`PC registrado: ${data.hostname} (${data.macAddress}) - IP: ${data.ip}`);
        
        ws.send(JSON.stringify({
          type: 'registered',
          success: true
        }));
      } else if (data.type === 'heartbeat') {
        // Atualizar último ping
        const pc = connectedPCs.get(data.macAddress);
        if (pc) {
          pc.lastSeen = Date.now();
          pc.ip = data.ip; // Atualizar IP se mudou
        }
      }
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
    }
  });
  
  ws.on('close', () => {
    // Remover PC desconectado
    for (let [mac, pc] of connectedPCs.entries()) {
      if (pc.ws === ws) {
        console.log(`PC desconectado: ${pc.hostname}`);
        connectedPCs.delete(mac);
        break;
      }
    }
  });
});

// Função para enviar comando para PC
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

// ==== ROTAS DA API ====

// Listar PCs conectados
app.get('/api/pcs', (req, res) => {
  const pcs = Array.from(connectedPCs.values()).map(pc => ({
    macAddress: pc.macAddress,
    ip: pc.ip,
    hostname: pc.hostname,
    lastSeen: pc.lastSeen,
    online: (Date.now() - pc.lastSeen) < 30000 // Online se ping nos últimos 30s
  }));
  
  res.json(pcs);
});

// Webhook genérico para IFTTT
app.post('/api/webhook/:macAddress/:command', (req, res) => {
  const { macAddress, command } = req.params;
  const params = req.body || {};
  
  console.log(`Webhook recebido: ${command} para ${macAddress}`);
  console.log('Parâmetros:', params);
  
  const result = sendCommandToPC(macAddress, command, params);
  res.json(result);
});

// Rota específica para comandos (para web app)
app.post('/api/command/:macAddress', (req, res) => {
  const { macAddress } = req.params;
  const { command, params } = req.body;
  
  console.log(`Comando API: ${command} para ${macAddress}`);
  
  const result = sendCommandToPC(macAddress, command, params || {});
  res.json(result);
});

// ==== COMANDOS ESPECÍFICOS ====

// Desligar PC
app.post('/api/webhook/:macAddress/shutdown', (req, res) => {
  const { macAddress } = req.params;
  const delay = req.body.delay || 0; // delay em minutos
  
  const result = sendCommandToPC(macAddress, 'shutdown', { delay });
  res.json(result);
});

// Cancelar shutdown
app.post('/api/webhook/:macAddress/cancel-shutdown', (req, res) => {
  const { macAddress } = req.params;
  const result = sendCommandToPC(macAddress, 'cancel-shutdown');
  res.json(result);
});

// Modo Cinema
app.post('/api/webhook/:macAddress/cinema-mode', (req, res) => {
  const { macAddress } = req.params;
  const result = sendCommandToPC(macAddress, 'cinema-mode');
  res.json(result);
});

// Modo Console (Steam Big Picture)
app.post('/api/webhook/:macAddress/console-mode', (req, res) => {
  const { macAddress } = req.params;
  const result = sendCommandToPC(macAddress, 'console-mode');
  res.json(result);
});

// Volume
app.post('/api/webhook/:macAddress/set-volume', (req, res) => {
  const { macAddress } = req.params;
  const volume = req.body.volume || req.query.volume || 50;
  
  const result = sendCommandToPC(macAddress, 'set-volume', { volume: parseInt(volume) });
  res.json(result);
});

// Mudar saída de áudio
app.post('/api/webhook/:macAddress/audio-output', (req, res) => {
  const { macAddress } = req.params;
  const device = req.body.device || req.query.device || 'default';
  
  const result = sendCommandToPC(macAddress, 'audio-output', { device });
  res.json(result);
});

// Abrir aplicativo
app.post('/api/webhook/:macAddress/open-app', (req, res) => {
  const { macAddress } = req.params;
  const appName = req.body.app || req.query.app;
  
  const result = sendCommandToPC(macAddress, 'open-app', { app: appName });
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
  res.sendFile(path.join(__dirname, '../web/index.html'));
});

// Iniciar servidor HTTP
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando em http://0.0.0.0:${PORT}`);
  console.log(`📡 WebSocket disponível para clientes`);
});

// Integrar WebSocket com servidor HTTP
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Limpar PCs inativos a cada minuto
setInterval(() => {
  const now = Date.now();
  for (let [mac, pc] of connectedPCs.entries()) {
    if (now - pc.lastSeen > 60000) { // 1 minuto sem ping
      console.log(`PC inativo removido: ${pc.hostname}`);
      connectedPCs.delete(mac);
    }
  }
}, 60000);

console.log('💻 Sistema de Controle de PC inicializado!');
