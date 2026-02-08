"""
PC Control Client
Cliente para Windows que executa comandos remotos via WebSocket
"""

import asyncio
import websockets
import json
import os
import subprocess
import platform
import socket
import uuid
import time
import winreg
from datetime import datetime, timedelta
import ctypes
from ctypes import cast, POINTER
from comtypes import CLSCTX_ALL
from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume

# Configurações
SERVER_URL = "ws://SEU_SERVIDOR_IP:3000"  # Altere para o IP do seu servidor
RECONNECT_DELAY = 5  # segundos

class PCControlClient:
    def __init__(self):
        self.mac_address = self.get_mac_address()
        self.hostname = socket.gethostname()
        self.ip = self.get_ip()
        self.shutdown_task = None
        
    def get_mac_address(self):
        """Obtém o MAC address principal"""
        mac = ':'.join(['{:02x}'.format((uuid.getnode() >> elements) & 0xff)
                       for elements in range(0, 2*6, 2)][::-1])
        return mac
    
    def get_ip(self):
        """Obtém o IP local"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except:
            return "127.0.0.1"
    
    async def send_heartbeat(self, websocket):
        """Envia heartbeat a cada 10 segundos"""
        while True:
            try:
                await websocket.send(json.dumps({
                    'type': 'heartbeat',
                    'macAddress': self.mac_address,
                    'ip': self.get_ip()
                }))
                await asyncio.sleep(10)
            except:
                break
    
    async def handle_command(self, command, params):
        """Executa comando recebido"""
        print(f"\n🎯 Comando recebido: {command}")
        print(f"   Parâmetros: {params}")
        
        try:
            if command == 'shutdown':
                await self.shutdown_pc(params.get('delay', 0))
            
            elif command == 'cancel-shutdown':
                await self.cancel_shutdown()
            
            elif command == 'cinema-mode':
                await self.cinema_mode()
            
            elif command == 'console-mode':
                await self.console_mode()
            
            elif command == 'set-volume':
                await self.set_volume(params.get('volume', 50))
            
            elif command == 'audio-output':
                await self.set_audio_output(params.get('device'))
            
            elif command == 'open-app':
                await self.open_application(params.get('app'))
            
            elif command == 'lock-pc':
                await self.lock_pc()
            
            elif command == 'sleep':
                await self.sleep_pc()
            
            elif command == 'monitor-off':
                await self.turn_off_monitor()
            
            else:
                print(f"⚠️  Comando desconhecido: {command}")
                
        except Exception as e:
            print(f"❌ Erro ao executar comando: {e}")
    
    async def shutdown_pc(self, delay_minutes=0):
        """Desliga o PC com delay opcional"""
        if self.shutdown_task:
            self.shutdown_task.cancel()
        
        if delay_minutes > 0:
            print(f"⏰ PC será desligado em {delay_minutes} minutos...")
            delay_seconds = delay_minutes * 60
            
            # Criar tarefa para shutdown
            self.shutdown_task = asyncio.create_task(
                self._delayed_shutdown(delay_seconds)
            )
        else:
            print("🔴 Desligando PC AGORA...")
            os.system("shutdown /s /t 5")
    
    async def _delayed_shutdown(self, seconds):
        """Shutdown com delay"""
        try:
            await asyncio.sleep(seconds)
            print("🔴 Executando shutdown...")
            os.system("shutdown /s /t 5")
        except asyncio.CancelledError:
            print("✅ Shutdown cancelado!")
    
    async def cancel_shutdown(self):
        """Cancela shutdown agendado"""
        if self.shutdown_task:
            self.shutdown_task.cancel()
            self.shutdown_task = None
        os.system("shutdown /a")
        print("✅ Shutdown cancelado!")
    
    async def cinema_mode(self):
        """Ativa modo cinema: monitor fullscreen, luzes apagadas"""
        print("🎬 Ativando modo cinema...")
        
        # Desligar monitores secundários (exemplo - ajuste conforme necessário)
        # os.system("displayswitch.exe /internal")
        
        # Modo teatro - maximizar janela ativa
        import pyautogui
        pyautogui.press('f11')  # Fullscreen na maioria dos apps
        
        # Baixar volume para nível confortável
        await self.set_volume(30)
        
        print("✅ Modo cinema ativado!")
    
    async def console_mode(self):
        """Ativa Steam Big Picture"""
        print("🎮 Iniciando Steam Big Picture...")
        
        steam_paths = [
            r"C:\Program Files (x86)\Steam\steam.exe",
            r"C:\Program Files\Steam\steam.exe",
            os.path.expanduser(r"~\Steam\steam.exe")
        ]
        
        for path in steam_paths:
            if os.path.exists(path):
                subprocess.Popen([path, "-bigpicture"])
                print("✅ Steam Big Picture iniciado!")
                return
        
        print("❌ Steam não encontrado!")
    
    async def set_volume(self, volume):
        """Define volume do sistema (0-100)"""
        try:
            devices = AudioUtilities.GetSpeakers()
            interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
            volume_control = cast(interface, POINTER(IAudioEndpointVolume))
            
            # Converter 0-100 para 0.0-1.0
            volume_level = volume / 100.0
            volume_control.SetMasterVolumeLevelScalar(volume_level, None)
            
            print(f"🔊 Volume ajustado para {volume}%")
        except Exception as e:
            print(f"❌ Erro ao ajustar volume: {e}")
    
    async def set_audio_output(self, device_name):
        """Muda saída de áudio (requer nircmd ou SoundVolumeView)"""
        print(f"🔈 Tentando mudar para: {device_name}")
        
        # Usando nircmd (baixe em: https://www.nirsoft.net/utils/nircmd.html)
        nircmd_path = os.path.join(os.path.dirname(__file__), "nircmd.exe")
        
        if os.path.exists(nircmd_path):
            # Exemplo de uso do nircmd
            cmd = f'"{nircmd_path}" setdefaultsounddevice "{device_name}"'
            os.system(cmd)
            print("✅ Saída de áudio alterada!")
        else:
            print("⚠️  nircmd.exe não encontrado. Baixe em: https://www.nirsoft.net/utils/nircmd.html")
    
    async def open_application(self, app_name):
        """Abre aplicativos específicos"""
        print(f"🚀 Abrindo: {app_name}")
        
        apps = {
            'youtube': lambda: subprocess.Popen([
                r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
                "https://youtube.com"
            ]),
            'brave': lambda: subprocess.Popen([
                r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
            ]),
            'league': lambda: subprocess.Popen([
                r"C:\Riot Games\League of Legends\LeagueClient.exe"
            ]),
            'lol': lambda: subprocess.Popen([
                r"C:\Riot Games\League of Legends\LeagueClient.exe"
            ]),
            'steam': lambda: subprocess.Popen([
                r"C:\Program Files (x86)\Steam\steam.exe"
            ]),
            'spotify': lambda: os.startfile("spotify:"),
            'discord': lambda: os.startfile(
                os.path.expanduser(r"~\AppData\Local\Discord\Update.exe --processStart Discord.exe")
            ),
        }
        
        app_lower = app_name.lower()
        if app_lower in apps:
            try:
                apps[app_lower]()
                print(f"✅ {app_name} aberto!")
            except Exception as e:
                print(f"❌ Erro ao abrir {app_name}: {e}")
        else:
            print(f"⚠️  App não configurado: {app_name}")
    
    async def lock_pc(self):
        """Bloqueia o PC"""
        print("🔒 Bloqueando PC...")
        ctypes.windll.user32.LockWorkStation()
    
    async def sleep_pc(self):
        """Coloca PC em suspensão"""
        print("😴 Entrando em modo suspensão...")
        os.system("rundll32.exe powrprof.dll,SetSuspendState 0,1,0")
    
    async def turn_off_monitor(self):
        """Desliga o monitor"""
        print("📴 Desligando monitor...")
        # WM_SYSCOMMAND SC_MONITORPOWER
        ctypes.windll.user32.SendMessageW(0xFFFF, 0x0112, 0xF170, 2)
    
    async def connect(self):
        """Conecta ao servidor WebSocket"""
        while True:
            try:
                print(f"\n🔌 Conectando ao servidor: {SERVER_URL}")
                print(f"   MAC: {self.mac_address}")
                print(f"   IP: {self.ip}")
                print(f"   Hostname: {self.hostname}")
                
                async with websockets.connect(SERVER_URL) as websocket:
                    # Registrar no servidor
                    await websocket.send(json.dumps({
                        'type': 'register',
                        'macAddress': self.mac_address,
                        'ip': self.ip,
                        'hostname': self.hostname
                    }))
                    
                    print("✅ Conectado ao servidor!")
                    
                    # Iniciar heartbeat
                    heartbeat_task = asyncio.create_task(
                        self.send_heartbeat(websocket)
                    )
                    
                    # Escutar comandos
                    async for message in websocket:
                        data = json.loads(message)
                        
                        if data['type'] == 'command':
                            await self.handle_command(
                                data['command'],
                                data.get('params', {})
                            )
                        elif data['type'] == 'registered':
                            print("✅ Registrado com sucesso!")
                    
            except websockets.exceptions.ConnectionClosed:
                print(f"❌ Conexão perdida. Reconectando em {RECONNECT_DELAY}s...")
            except Exception as e:
                print(f"❌ Erro: {e}")
                print(f"   Tentando novamente em {RECONNECT_DELAY}s...")
            
            await asyncio.sleep(RECONNECT_DELAY)

def main():
    print("=" * 60)
    print("🖥️  PC CONTROL CLIENT")
    print("=" * 60)
    
    client = PCControlClient()
    
    try:
        asyncio.run(client.connect())
    except KeyboardInterrupt:
        print("\n\n👋 Cliente encerrado pelo usuário")

if __name__ == "__main__":
    main()
