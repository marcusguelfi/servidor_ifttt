# 🎯 Guia de Configuração IFTTT + Alexa

## 📋 Índice
1. [Requisitos](#requisitos)
2. [Configuração do Servidor](#configuração-do-servidor)
3. [Configuração do Cliente (PC)](#configuração-do-cliente-pc)
4. [Configuração IFTTT](#configuração-ifttt)
5. [Comandos de Voz Alexa](#comandos-de-voz-alexa)
6. [Troubleshooting](#troubleshooting)

---

## 🔧 Requisitos

### Servidor (PC Velho com Portainer)
- Docker e Portainer instalados
- Porta 3000 liberada no firewall
- IP fixo ou DynDNS configurado

### PC Principal (Windows)
- Python 3.8 ou superior
- Conexão com a mesma rede do servidor

### IFTTT
- Conta IFTTT (gratuita ou Pro)
- Alexa configurada na mesma conta Amazon

---

## 🖥️ Configuração do Servidor

### 1. Deploy no Portainer

1. Acesse o Portainer
2. Vá em **Stacks** → **Add Stack**
3. Cole o conteúdo do `docker-compose.yml`
4. Nomeie como `pc-control`
5. Clique em **Deploy the stack**

### 2. Verificar se está rodando

```bash
# Verificar logs
docker logs pc-control-server

# Testar API
curl http://SEU_IP:3000/api/health
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "connectedPCs": 0,
  "timestamp": 1234567890
}
```

### 3. Liberar porta no firewall

**No servidor Linux:**
```bash
sudo ufw allow 3000/tcp
```

**No roteador:**
- Abra a porta 3000 e aponte para o IP do servidor

---

## 💻 Configuração do Cliente (PC)

### 1. Baixar arquivos
Copie a pasta `client` para o seu PC Windows

### 2. Instalar

Execute como Administrador:
```cmd
install.bat
```

**O instalador vai:**
- ✅ Verificar Python
- ✅ Instalar dependências
- ✅ Configurar IP do servidor
- ✅ Criar atalho na inicialização (opcional)

### 3. Configuração manual (alternativa)

```cmd
# Instalar dependências
pip install -r requirements.txt

# Editar pc_client.py
# Alterar linha: SERVER_URL = "ws://SEU_IP_SERVIDOR:3000"
```

### 4. Executar

```cmd
# Modo visível (para testes)
python pc_client.py

# Modo background (depois de configurado)
wscript run_client.vbs
```

### 5. Verificar conexão

No terminal do cliente você deve ver:
```
✅ Conectado ao servidor!
✅ Registrado com sucesso!
```

---

## 🌐 Configuração IFTTT

### 1. Obter URL do webhook

**Formato do webhook:**
```
http://SEU_IP_OU_DOMINIO:3000/api/webhook/MAC_ADDRESS/COMANDO
```

**Descobrir MAC Address do PC:**
- Olhe no log do cliente Python, ou
- Execute no Windows: `ipconfig /all` e procure "Endereço Físico"

**Exemplo de URL:**
```
http://192.168.1.100:3000/api/webhook/AA:BB:CC:DD:EE:FF/shutdown
```

### 2. Criar Applets no IFTTT

#### Desligar PC agora

1. **IF**: Alexa → Say a specific phrase
   - Phrase: `desligar o computador`
   
2. **THEN**: Webhooks → Make a web request
   - URL: `http://SEU_IP:3000/api/webhook/SEU_MAC/shutdown`
   - Method: `POST`
   - Content Type: `application/json`
   - Body: `{"delay": 0}`

#### Desligar em 1 hora

1. **IF**: Alexa → Say a specific phrase
   - Phrase: `desligar o computador em uma hora`
   
2. **THEN**: Webhooks → Make a web request
   - URL: `http://SEU_IP:3000/api/webhook/SEU_MAC/shutdown`
   - Method: `POST`
   - Content Type: `application/json`
   - Body: `{"delay": 60}`

#### Desligar em 1:30h

Body: `{"delay": 90}`

#### Desligar em 2h

Body: `{"delay": 120}`

#### Modo Cinema

1. **IF**: Alexa → Say a specific phrase
   - Phrase: `ativar modo cinema`
   
2. **THEN**: Webhooks
   - URL: `http://SEU_IP:3000/api/webhook/SEU_MAC/cinema-mode`
   - Method: `POST`

#### Modo Console (Steam)

Phrase: `ativar modo console`
URL: `.../console-mode`

#### Volume 10%

1. **IF**: Alexa → Say a specific phrase
   - Phrase: `volume do computador em dez porcento`
   
2. **THEN**: Webhooks
   - URL: `http://SEU_IP:3000/api/webhook/SEU_MAC/set-volume`
   - Method: `POST`
   - Body: `{"volume": 10}`

**Repita para:** 20, 30, 50, 80, 90, 100

#### Abrir YouTube

Phrase: `abrir youtube no computador`
URL: `.../open-app`
Body: `{"app": "youtube"}`

#### Abrir League of Legends

Phrase: `abrir league of legends`
URL: `.../open-app`
Body: `{"app": "league"}`

---

## 🎤 Comandos de Voz Alexa

Depois de configurar os applets, você pode falar:

### Sistema
- "Alexa, desligar o computador"
- "Alexa, desligar o computador em uma hora"
- "Alexa, desligar o computador em uma hora e meia"
- "Alexa, desligar o computador em duas horas"
- "Alexa, cancelar desligamento do computador"
- "Alexa, bloquear o computador"
- "Alexa, suspender o computador"

### Modos
- "Alexa, ativar modo cinema"
- "Alexa, ativar modo console"

### Volume
- "Alexa, volume do computador em dez porcento"
- "Alexa, volume do computador em cinquenta porcento"
- "Alexa, volume do computador em cem porcento"

### Apps
- "Alexa, abrir YouTube no computador"
- "Alexa, abrir League of Legends"
- "Alexa, abrir Steam"

---

## 🌍 Acesso Externo (Internet)

### Opção 1: DynDNS + Port Forwarding

1. Criar conta no [No-IP](https://www.noip.com) ou [DuckDNS](https://www.duckdns.org)
2. Configurar domínio (ex: `meupc.ddns.net`)
3. No roteador, redirecionar porta 3000 para o servidor
4. Usar `http://meupc.ddns.net:3000` nas URLs do IFTTT

### Opção 2: Cloudflare Tunnel (Mais seguro)

1. Instalar Cloudflare Tunnel no servidor
2. Criar tunnel apontando para `localhost:3000`
3. Obter URL público (ex: `https://pc-control.user.trycloudflare.com`)
4. Usar essa URL no IFTTT (sem precisar de porta 3000)

### Opção 3: Tailscale (VPN)

1. Instalar Tailscale no servidor e PC
2. Acessar via IP da Tailscale
3. Funciona de qualquer lugar sem port forwarding

---

## 🛠️ Troubleshooting

### Cliente não conecta ao servidor

**Problema:** `❌ Conexão perdida. Reconectando...`

**Soluções:**
1. Verificar se o IP está correto no `pc_client.py`
2. Verificar se o servidor está rodando: `docker ps`
3. Testar conectividade: `ping IP_SERVIDOR`
4. Verificar firewall do servidor

### IFTTT não dispara

**Problema:** Alexa reconhece mas nada acontece

**Soluções:**
1. Verificar se o webhook está correto
2. Testar URL manualmente no navegador ou Postman
3. Verificar logs do servidor: `docker logs pc-control-server`
4. Confirmar que o MAC address está correto

### Comando não executa no PC

**Problema:** Servidor recebe mas PC não executa

**Soluções:**
1. Verificar se o cliente está conectado (olhar logs)
2. Verificar se o MAC address coincide
3. Alguns comandos precisam de apps instalados (Steam, League, etc)
4. Para controle de áudio, baixar [nircmd](https://www.nirsoft.net/utils/nircmd.html)

### Volume não funciona

**Problema:** Erro ao ajustar volume

**Solução:**
```cmd
pip install --upgrade pycaw comtypes
```

### Apps não abrem

**Problema:** App não encontrado

**Solução:**
Editar `pc_client.py` e ajustar os caminhos dos apps:

```python
apps = {
    'league': lambda: subprocess.Popen([
        r"C:\SEU\CAMINHO\PARA\LeagueClient.exe"  # Ajuste aqui
    ]),
    ...
}
```

---

## 📊 Comandos Adicionais Sugeridos

### Mudar saída de áudio
```
Alexa, áudio do computador no fone
```

Applet:
- URL: `.../audio-output`
- Body: `{"device": "Fone de Ouvido"}`

**Nota:** Requer [nircmd.exe](https://www.nirsoft.net/utils/nircmd.html) na pasta do cliente

### Desligar monitor
```
Alexa, desligar monitor do computador
```

- URL: `.../monitor-off`

### Outros apps úteis

**Discord:**
```python
'discord': lambda: os.startfile("discord://")
```

**Netflix:**
```python
'netflix': lambda: subprocess.Popen([
    r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
    "https://netflix.com"
])
```

---

## 🎁 Recursos Extras

### Web Dashboard

Acesse `http://SEU_IP:3000` no navegador para controlar manualmente!

### API Endpoints

**Listar PCs:**
```
GET http://SEU_IP:3000/api/pcs
```

**Enviar comando:**
```
POST http://SEU_IP:3000/api/command/MAC_ADDRESS
Body: {
  "command": "shutdown",
  "params": {"delay": 60}
}
```

**Webhook genérico:**
```
POST http://SEU_IP:3000/api/webhook/MAC_ADDRESS/COMANDO
Body: { "parametros": "aqui" }
```

---

## 📝 Notas Finais

- **Segurança:** Se expor na internet, use HTTPS e autenticação
- **IP Dinâmico:** Use DynDNS ou Cloudflare Tunnel
- **Backup:** Faça backup da pasta `data` periodicamente
- **Logs:** Monitore os logs para debug

**Divirta-se controlando seu PC com a voz! 🎉**
