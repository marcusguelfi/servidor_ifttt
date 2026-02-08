# 🚀 Guia de Início Rápido

## 5 Minutos para Começar!

### 📋 Checklist

- [ ] Servidor com Docker/Portainer
- [ ] PC Windows com Python
- [ ] Ambos na mesma rede
- [ ] Conta IFTTT + Alexa

---

## ⚡ Passo a Passo

### 1. Deploy do Servidor (2 min)

```bash
# Opção A: Via Portainer (Recomendado)
1. Abra Portainer → Stacks → Add Stack
2. Nome: pc-control
3. Cole o docker-compose.yml
4. Deploy!

# Opção B: Via terminal no servidor
cd /onde/colocou/os/arquivos
docker-compose up -d
```

**Verificar:**
```bash
docker ps
# Deve mostrar: pc-control-server

docker logs pc-control-server
# Deve mostrar: 🚀 Servidor rodando em http://0.0.0.0:3000
```

### 2. Instalar Cliente no PC (2 min)

```cmd
# 1. Abrir pasta 'client' no Windows
# 2. Clicar com botão direito em 'install.bat'
# 3. Executar como Administrador
# 4. Digite o IP do servidor quando pedir
# 5. Aceite criar atalho na inicialização
```

**Verificar:**
- Terminal abre e mostra: `✅ Conectado ao servidor!`
- Se não conectar, verifique o IP e firewall

### 3. Testar no Dashboard (30 seg)

```
http://SEU_IP_SERVIDOR:3000
```

**Deve aparecer:**
- ✅ Servidor Online
- ✅ 1 PC Conectado
- Card com o nome do seu PC

**Teste:**
- Clique em "🔊 Volume 50%"
- Volume do PC deve mudar!

### 4. Configurar IFTTT (5 min)

#### A. Descobrir seu MAC Address

**No cliente Windows, procure:**
```
MAC: AA:BB:CC:DD:EE:FF  <-- Este aqui!
```

#### B. Criar primeiro Applet

1. Acesse [ifttt.com/create](https://ifttt.com/create)

2. **IF This:**
   - Escolha: Alexa
   - Trigger: Say a specific phrase
   - Phrase: `desligar o computador`

3. **Then That:**
   - Escolha: Webhooks
   - Action: Make a web request
   - URL: `http://SEU_IP:3000/api/webhook/SEU_MAC/shutdown`
   - Method: `POST`
   - Content Type: `application/json`
   - Body: `{"delay": 0}`

4. **Finish!**

#### C. Testar

Fale para sua Alexa:
```
"Alexa, desligar o computador"
```

**Deve acontecer:**
1. Alexa: "Okay!"
2. PC: Janela de shutdown aparece
3. Dashboard: Mostra comando enviado

**Se não funcionar:**
- Verifique se o MAC está correto
- Teste a URL no navegador
- Veja os logs do servidor

---

## 🎯 Próximos Applets (Copiar e Colar!)

### Desligar em 1 hora

- Phrase: `desligar o computador em uma hora`
- URL: `http://SEU_IP:3000/api/webhook/SEU_MAC/shutdown`
- Body: `{"delay": 60}`

### Modo Cinema

- Phrase: `ativar modo cinema`
- URL: `http://SEU_IP:3000/api/webhook/SEU_MAC/cinema-mode`
- Body: `{}`

### Modo Console (Steam)

- Phrase: `ativar modo console`
- URL: `http://SEU_IP:3000/api/webhook/SEU_MAC/console-mode`
- Body: `{}`

### Volume 50%

- Phrase: `volume do computador em cinquenta porcento`
- URL: `http://SEU_IP:3000/api/webhook/SEU_MAC/set-volume`
- Body: `{"volume": 50}`

### Abrir YouTube

- Phrase: `abrir youtube no computador`
- URL: `http://SEU_IP:3000/api/webhook/SEU_MAC/open-app`
- Body: `{"app": "youtube"}`

---

## 🔧 Comandos Úteis

### Servidor

```bash
# Ver logs
docker logs pc-control-server

# Reiniciar
docker restart pc-control-server

# Parar
docker stop pc-control-server

# Ver status
docker ps | grep pc-control
```

### Cliente (Windows)

```cmd
# Executar em primeiro plano (para debug)
python pc_client.py

# Executar em background
wscript run_client.vbs

# Parar (abrir Task Manager e matar processo Python)
```

### Testar API

```bash
# Health check
curl http://SEU_IP:3000/api/health

# Listar PCs
curl http://SEU_IP:3000/api/pcs

# Enviar comando manual
curl -X POST http://SEU_IP:3000/api/webhook/MAC/shutdown \
  -H "Content-Type: application/json" \
  -d '{"delay": 0}'
```

---

## ❓ Problemas Comuns

### "PC não conectado" no IFTTT

**Causa:** Cliente não está rodando ou IP errado

**Solução:**
1. Verificar se `python pc_client.py` está executando
2. Conferir IP no arquivo `pc_client.py`
3. Ver logs do cliente

### "Conexão perdida" no cliente

**Causa:** Firewall bloqueando porta 3000

**Solução:**
```bash
# No servidor Linux
sudo ufw allow 3000/tcp

# No Windows (cliente)
# Firewall do Windows → Regras de entrada → Nova regra
# Porta 3000 TCP
```

### Alexa não responde

**Causa:** Applet IFTTT não configurado corretamente

**Solução:**
1. Verificar se a frase está exata
2. Testar o webhook manualmente no navegador
3. Reconectar Alexa no IFTTT

### Volume não funciona

**Causa:** Biblioteca pycaw com problema

**Solução:**
```cmd
pip install --upgrade pycaw comtypes
```

### Apps não abrem

**Causa:** Caminhos incorretos

**Solução:**
Editar `pc_client.py` e ajustar os paths:
```python
'league': lambda: subprocess.Popen([
    r"C:\CAMINHO\CORRETO\LeagueClient.exe"
])
```

---

## 🎁 Dicas Extras

### 1. Acesso pela Internet

Use Cloudflare Tunnel (grátis e seguro):
```bash
# No servidor
cloudflared tunnel --url http://localhost:3000

# Copie a URL gerada (ex: https://abc-123.trycloudflare.com)
# Use esta URL no IFTTT!
```

### 2. Múltiplos PCs

Cada PC tem seu próprio MAC address:
```
PC Quarto:  AA:BB:CC:DD:EE:FF
PC Sala:    11:22:33:44:55:66
```

URLs diferentes no IFTTT:
```
Desligar quarto: .../AA:BB:CC:DD:EE:FF/shutdown
Desligar sala:   .../11:22:33:44:55:66/shutdown
```

### 3. Inicialização Automática

**Servidor:**
- Docker já inicia automaticamente!

**Cliente Windows:**
- Se instalou com `install.bat`, já está na inicialização
- Senão, adicione `run_client.vbs` na pasta Startup:
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`

### 4. Backup

Copie periodicamente:
```bash
# No servidor
docker cp pc-control-server:/data ./backup-data
```

---

## 📚 Mais Informações

- **Documentação completa:** [README.md](README.md)
- **Guia IFTTT detalhado:** [GUIA_IFTTT.md](GUIA_IFTTT.md)
- **Testar API:** Execute `bash test_api.sh SEU_IP`

---

## 🎉 Pronto!

Agora você pode:
- ✅ Controlar PC pela voz
- ✅ Usar o dashboard web
- ✅ Criar novos comandos

**Divirta-se! 🎮**
