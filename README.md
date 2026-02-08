# 🎮 Sistema de Controle de PC via Alexa + IFTTT

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)
![Docker](https://img.shields.io/badge/docker-required-green.svg)

Controle seu PC remotamente usando comandos de voz na Alexa! Sistema completo com servidor Docker, cliente Windows e interface web.

## ✨ Características

- 🎤 **Controle por Voz** - Use Alexa para controlar seu PC
- 🖥️ **Web Dashboard** - Interface visual para controle manual
- 🔄 **Auto-Discovery** - Localiza PC por MAC address mesmo com IP dinâmico
- 🐳 **Docker Ready** - Fácil deploy no Portainer
- 🔒 **Múltiplos PCs** - Controle vários computadores simultaneamente
- ⚡ **Tempo Real** - WebSocket para comunicação instantânea

## 🎯 Comandos Disponíveis

### 🔴 Sistema
- Desligar PC (imediato, 1h, 1:30h, 2h)
- Cancelar shutdown
- Bloquear PC
- Suspender PC
- Desligar monitor

### 🎬 Modos Especiais
- **Modo Cinema** - Fullscreen + volume confortável
- **Modo Console** - Steam Big Picture

### 🔊 Áudio
- Controle de volume (10%, 20%, 30%, 50%, 80%, 90%, 100%)
- Mudar saída de áudio (fone, caixas, etc)

### 🚀 Aplicativos
- YouTube (Brave)
- League of Legends
- Steam
- Spotify
- Discord
- Qualquer app configurado

## 📦 Estrutura do Projeto

```
pc-control-system/
├── docker-compose.yml          # Configuração Docker
├── server/                     # Servidor Node.js
│   ├── index.js               # API e WebSocket
│   └── package.json
├── client/                     # Cliente Windows
│   ├── pc_client.py           # Cliente Python
│   ├── requirements.txt
│   ├── install.bat            # Instalador Windows
│   └── run_client.vbs         # Executar em background
├── web/                        # Interface web
│   └── index.html             # Dashboard
├── GUIA_IFTTT.md              # Guia de configuração IFTTT
└── README.md                   # Este arquivo
```

## 🚀 Instalação Rápida

### 1️⃣ Servidor (Portainer)

1. Acesse seu Portainer
2. Vá em **Stacks** → **Add Stack**
3. Cole o conteúdo de `docker-compose.yml`
4. Nome: `pc-control`
5. **Deploy the stack**

### 2️⃣ Cliente (PC Windows)

1. Baixe a pasta `client`
2. Execute `install.bat` como Administrador
3. Digite o IP do servidor quando solicitado
4. Pronto! O cliente já vai conectar automaticamente

### 3️⃣ IFTTT (Alexa)

Siga o guia completo em [GUIA_IFTTT.md](GUIA_IFTTT.md)

## 🌐 Acessar Web Dashboard

Abra no navegador:
```
http://IP_DO_SERVIDOR:3000
```

## 📋 Requisitos

### Servidor
- Docker + Portainer
- Porta 3000 disponível
- Linux (Ubuntu, Debian, etc)

### PC Cliente
- Windows 10/11
- Python 3.8+
- Mesma rede do servidor (ou VPN/Tailscale)

### IFTTT
- Conta IFTTT (gratuita funciona)
- Alexa configurada

## 🔧 Configuração Avançada

### Descoberta por MAC Address

O sistema já localiza o PC automaticamente pelo MAC address, mesmo que o IP mude!

**Como funciona:**
1. Cliente envia seu MAC address ao conectar
2. Servidor mapeia MAC → IP atual
3. IFTTT usa MAC address na URL
4. Servidor encontra o IP correto automaticamente

### Adicionar Novos Comandos

**1. No cliente (`pc_client.py`):**

```python
async def handle_command(self, command, params):
    # ...
    elif command == 'seu-comando':
        await self.seu_metodo(params)

async def seu_metodo(self, params):
    print("Executando seu comando!")
    # Seu código aqui
```

**2. No servidor (`index.js`):**

```javascript
app.post('/api/webhook/:macAddress/seu-comando', (req, res) => {
  const { macAddress } = req.params;
  const params = req.body;
  
  const result = sendCommandToPC(macAddress, 'seu-comando', params);
  res.json(result);
});
```

**3. No IFTTT:**

- Phrase: `executar seu comando`
- URL: `http://SEU_IP:3000/api/webhook/MAC/seu-comando`

### Customizar Apps

Edite `pc_client.py` na seção `apps`:

```python
apps = {
    'youtube': lambda: subprocess.Popen([
        r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        "https://youtube.com"
    ]),
    # Adicione seus apps aqui
    'vscode': lambda: subprocess.Popen([
        r"C:\Users\SEU_USUARIO\AppData\Local\Programs\Microsoft VS Code\Code.exe"
    ]),
}
```

## 🔐 Segurança

### Recomendações

1. **Firewall:** Não exponha porta 3000 diretamente na internet
2. **VPN:** Use Tailscale ou WireGuard para acesso remoto
3. **Autenticação:** Adicione token/senha se necessário
4. **HTTPS:** Use Cloudflare Tunnel ou reverse proxy

### Cloudflare Tunnel (Recomendado)

```bash
# No servidor
cloudflared tunnel --url http://localhost:3000
```

Você receberá uma URL HTTPS pública grátis!

## 📊 API Endpoints

### Health Check
```bash
GET /api/health
```

### Listar PCs
```bash
GET /api/pcs
```

### Enviar Comando
```bash
POST /api/command/:macAddress
Body: {
  "command": "shutdown",
  "params": {"delay": 60}
}
```

### Webhook (IFTTT)
```bash
POST /api/webhook/:macAddress/:comando
Body: { "parametros": "aqui" }
```

## 🐛 Troubleshooting

### Cliente não conecta

```bash
# Verifique se o servidor está rodando
docker ps

# Veja os logs
docker logs pc-control-server

# Teste a API
curl http://SEU_IP:3000/api/health
```

### Firewall bloqueando

**Linux (servidor):**
```bash
sudo ufw allow 3000/tcp
```

**Windows (cliente):**
```cmd
# Execute como Admin
netsh advfirewall firewall add rule name="PC Control" dir=in action=allow protocol=TCP localport=3000
```

### Logs do Cliente

O cliente mostra tudo no console:
```
✅ Conectado ao servidor!
✅ Registrado com sucesso!
🎯 Comando recebido: shutdown
```

## 🎁 Recursos Extras

### Wake-on-LAN

Adicione suporte para ligar o PC remotamente:

```python
# Cliente
from wakeonlan import send_magic_packet

async def wake_pc(self):
    send_magic_packet(self.mac_address)
```

### Notificações

Envie notificações para seu celular quando comandos são executados:

```python
# Use Pushbullet, Pushover, ou IFTTT notifications
```

### Scheduler

Agende comandos para horários específicos:

```python
# Desligar sempre às 23h
import schedule

schedule.every().day.at("23:00").do(lambda: shutdown_pc(0))
```

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se livre para:

- Reportar bugs
- Sugerir novos comandos
- Melhorar a documentação
- Adicionar features

## 📄 Licença

MIT License - veja LICENSE para detalhes

## 💬 Suporte

Encontrou algum problema? 

1. Verifique o [GUIA_IFTTT.md](GUIA_IFTTT.md)
2. Veja a seção Troubleshooting
3. Abra uma issue com logs e detalhes

## 🌟 Agradecimentos

- Node.js e Express
- Python e WebSockets
- IFTTT
- Alexa Skills

---

**Feito com ❤️ para automação doméstica**

🎮 Divirta-se controlando seu PC com a voz!
