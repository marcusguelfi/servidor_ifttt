# 💡 Comandos Extras - Ideias de Implementação

## 🎯 Comandos Adicionais Sugeridos

Aqui estão alguns comandos úteis que você pode adicionar ao sistema!

---

## 📺 Controle de Monitor

### Mudar entrada HDMI
```python
async def change_hdmi_input(self, input_number):
    """Muda entrada HDMI do monitor (requer nircmd)"""
    # Funciona com monitores que suportam DDC/CI
    os.system(f'nircmd.exe monitor {input_number}')
```

**Comando Alexa:** "Mudar monitor para HDMI 1"

### Alterar resolução
```python
async def change_resolution(self, width, height):
    """Altera resolução da tela"""
    os.system(f'nircmd.exe setdisplay {width} {height} 32')
```

### Desabilitar segundo monitor
```python
async def toggle_second_monitor(self):
    """Liga/desliga segundo monitor"""
    os.system('displayswitch.exe /internal')  # Apenas monitor principal
    # ou
    os.system('displayswitch.exe /extend')    # Estender
```

---

## 🎵 Controle de Mídia

### Play/Pause global
```python
import pyautogui

async def media_play_pause(self):
    """Play/Pause em qualquer player"""
    pyautogui.press('playpause')
```

### Próxima/Anterior música
```python
async def media_next(self):
    pyautogui.press('nexttrack')

async def media_previous(self):
    pyautogui.press('prevtrack')
```

### Controlar Spotify específico
```python
import requests

async def spotify_play(self):
    """Requer Spotify API"""
    # Configurar Spotify API e token
    url = "https://api.spotify.com/v1/me/player/play"
    headers = {"Authorization": f"Bearer {SPOTIFY_TOKEN}"}
    requests.put(url, headers=headers)
```

**Comandos Alexa:**
- "Pausar música no computador"
- "Próxima música"
- "Música anterior"

---

## 🖱️ Automações de Input

### Movimentar mouse
```python
import pyautogui

async def move_mouse(self, x, y):
    """Move mouse para coordenadas"""
    pyautogui.moveTo(x, y)

async def click_at(self, x, y):
    """Clica em coordenadas"""
    pyautogui.click(x, y)
```

### Simular pressionamento de teclas
```python
async def press_keys(self, keys):
    """Pressiona combinação de teclas"""
    # Exemplo: 'ctrl+shift+esc' para Task Manager
    pyautogui.hotkey(*keys.split('+'))
```

**Comandos:**
- "Abrir gerenciador de tarefas" → Ctrl+Shift+Esc
- "Alternar janela" → Alt+Tab
- "Screenshot" → Win+Shift+S

---

## 📁 Gerenciamento de Arquivos

### Abrir pasta específica
```python
async def open_folder(self, path):
    """Abre pasta no Explorer"""
    os.startfile(path)
```

### Esvaziar lixeira
```python
from winshell import recycle_bin

async def empty_recycle_bin(self):
    """Esvazia lixeira"""
    recycle_bin().empty(confirm=False, show_progress=False)
```

### Organizar Downloads
```python
async def organize_downloads(self):
    """Organiza pasta de Downloads por tipo"""
    downloads = os.path.expanduser('~/Downloads')
    # Mover PDFs para pasta PDFs, etc
```

---

## 🌐 Automações Web

### Abrir sites específicos
```python
apps = {
    'gmail': lambda: subprocess.Popen([
        r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        "https://gmail.com"
    ]),
    'whatsapp': lambda: subprocess.Popen([
        r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        "https://web.whatsapp.com"
    ]),
    'netflix': lambda: subprocess.Popen([
        r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        "https://netflix.com"
    ]),
}
```

### Fazer busca no Google
```python
async def google_search(self, query):
    """Abre busca no Google"""
    url = f"https://google.com/search?q={query.replace(' ', '+')}"
    subprocess.Popen([BROWSER_PATH, url])
```

**Comando Alexa:** "Buscar receita de bolo no computador"

---

## 🎮 Gaming

### Matar processo de jogo
```python
import psutil

async def kill_game(self, game_name):
    """Fecha jogo específico"""
    for proc in psutil.process_iter(['name']):
        if game_name.lower() in proc.info['name'].lower():
            proc.kill()
```

### Otimizar para gaming
```python
async def gaming_mode(self):
    """Modo gaming: fecha apps desnecessários, prioridade alta"""
    # Fechar apps
    apps_to_close = ['Discord.exe', 'Chrome.exe', 'Spotify.exe']
    for app in apps_to_close:
        os.system(f'taskkill /F /IM {app}')
    
    # Limpar RAM
    os.system('rundll32.exe advapi32.dll,ProcessIdleTasks')
```

### Abrir Discord + jogo
```python
async def game_session(self, game):
    """Abre Discord e jogo específico"""
    # Discord
    os.startfile(r"C:\Users\...\Discord\Discord.exe")
    await asyncio.sleep(5)
    
    # Jogo
    if game == 'league':
        subprocess.Popen([r"C:\Riot Games\League of Legends\LeagueClient.exe"])
```

---

## 🔔 Notificações

### Notificação Windows
```python
from win10toast import ToastNotifier

async def show_notification(self, title, message):
    """Mostra notificação do Windows"""
    toaster = ToastNotifier()
    toaster.show_toast(title, message, duration=5)
```

### Enviar para Telegram
```python
import requests

async def telegram_notify(self, message):
    """Envia notificação via bot Telegram"""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = {"chat_id": CHAT_ID, "text": message}
    requests.post(url, data=data)
```

---

## 📊 Monitoramento

### Status do sistema
```python
import psutil

async def get_system_stats(self):
    """Retorna stats do sistema"""
    return {
        'cpu': psutil.cpu_percent(),
        'ram': psutil.virtual_memory().percent,
        'disk': psutil.disk_usage('/').percent,
        'temp': psutil.sensors_temperatures() if hasattr(psutil, 'sensors_temperatures') else None
    }
```

### Alerta de temperatura
```python
async def check_temperature(self):
    """Alerta se temperatura alta"""
    # Requer instalação de sensores
    temps = psutil.sensors_temperatures()
    if temps and temps['coretemp'][0].current > 80:
        await self.show_notification("Alerta", "Temperatura alta!")
```

---

## 🔧 Manutenção

### Limpeza de disco
```python
async def cleanup_disk(self):
    """Executa limpeza de disco"""
    os.system('cleanmgr /sagerun:1')
```

### Atualizar Windows (forçar check)
```python
async def check_updates(self):
    """Verifica atualizações do Windows"""
    os.system('UsoClient StartScan')
```

### Reiniciar serviços
```python
async def restart_service(self, service_name):
    """Reinicia serviço do Windows"""
    os.system(f'net stop {service_name}')
    await asyncio.sleep(2)
    os.system(f'net start {service_name}')
```

---

## 🌙 Rotinas/Cenas

### Rotina "Dormir"
```python
async def bedtime_routine(self):
    """Rotina antes de dormir"""
    # Fechar apps específicos
    apps = ['Chrome.exe', 'Discord.exe', 'Spotify.exe']
    for app in apps:
        os.system(f'taskkill /F /IM {app}')
    
    # Volume baixo
    await self.set_volume(10)
    
    # Desligar monitor
    await self.turn_off_monitor()
    
    # Agendar shutdown
    await self.shutdown_pc(60)  # 1 hora
```

### Rotina "Trabalho"
```python
async def work_routine(self):
    """Iniciar rotina de trabalho"""
    # Abrir apps
    apps = ['Teams', 'Outlook', 'Chrome', 'VSCode']
    for app in apps:
        await self.open_application(app)
        await asyncio.sleep(3)
    
    # Volume médio
    await self.set_volume(30)
```

### Rotina "Entretenimento"
```python
async def entertainment_routine(self):
    """Modo entretenimento"""
    await self.cinema_mode()
    await self.set_volume(50)
    await self.open_application('netflix')
```

**Comandos Alexa:**
- "Iniciar rotina de dormir"
- "Modo trabalho no computador"
- "Hora de assistir filme"

---

## 🔐 Segurança

### Tirar screenshot
```python
import pyautogui
from datetime import datetime

async def take_screenshot(self):
    """Tira screenshot"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = f"C:/Users/Public/screenshot_{timestamp}.png"
    pyautogui.screenshot(path)
    return path
```

### Ativar webcam
```python
import cv2

async def enable_webcam(self):
    """Liga webcam (para vigilância)"""
    cap = cv2.VideoCapture(0)
    # Código para gravação ou streaming
```

---

## 📝 Como Implementar

### 1. Adicionar no Cliente

Edite `pc_client.py`:

```python
async def handle_command(self, command, params):
    # ... comandos existentes ...
    
    elif command == 'seu-novo-comando':
        await self.seu_metodo(params)

async def seu_metodo(self, params):
    print("Executando novo comando!")
    # Seu código aqui
```

### 2. Adicionar Rota no Servidor

Edite `server/index.js`:

```javascript
app.post('/api/webhook/:macAddress/seu-comando', (req, res) => {
  const { macAddress } = req.params;
  const params = req.body;
  
  const result = sendCommandToPC(macAddress, 'seu-comando', params);
  res.json(result);
});
```

### 3. Criar Applet IFTTT

- Phrase: `executar seu comando`
- URL: `http://SEU_IP:3000/api/webhook/MAC/seu-comando`
- Body: `{"param": "valor"}`

---

## 🎁 Bibliotecas Úteis

```bash
# Interface gráfica
pip install pyautogui

# Sistema
pip install psutil

# Notificações
pip install win10toast

# Webcam
pip install opencv-python

# Clipboard
pip install pyperclip

# Arquivos Windows
pip install winshell

# Telegram
pip install python-telegram-bot

# Spotify
pip install spotipy
```

---

## 💡 Ideias Criativas

- Wake-on-LAN para ligar PC remotamente
- Controle de RGB (se tiver periféricos RGB)
- Gravar tela com comando de voz
- Backup automático agendado
- Monitorar preços e alertar
- Bot para jogos AFK
- Automação de downloads
- Sincronizar com Google Calendar
- Controlar OBS para streaming
- Mutar microfone globalmente

---

**Divirta-se criando seus próprios comandos! 🚀**
