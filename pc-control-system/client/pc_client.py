"""
PC Control Client
Cliente para Windows que executa comandos remotos via WebSocket
"""

import asyncio
import websockets
import json
import os
import subprocess
import socket
import uuid
import ctypes
from ctypes import cast, POINTER
from comtypes import CLSCTX_ALL
from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
import psutil
import pyautogui

# Configurações
SERVER_URL = "ws://192.168.0.225:3000"
RECONNECT_DELAY = 5


class PCControlClient:
    def __init__(self):
        self.mac_address = self.get_mac_address()
        self.hostname = socket.gethostname()
        self.ip = self.get_ip()
        self.shutdown_task = None
        self.tts_engine = None

    def get_mac_address(self):
        mac = ':'.join(['{:02x}'.format((uuid.getnode() >> elements) & 0xff)
                       for elements in range(0, 2*6, 2)][::-1])
        return mac

    def get_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def get_audio_devices(self):
        """Lista dispositivos de áudio disponíveis"""
        devices = []
        try:
            all_devices = AudioUtilities.GetAllDevices()
            for i, dev in enumerate(all_devices):
                if dev.FriendlyName:
                    devices.append({
                        "index": i,
                        "name": dev.FriendlyName,
                        "id": dev.id
                    })
        except Exception as e:
            print(f"Erro ao listar devices: {e}")
        return devices

    def get_system_info(self):
        """Retorna info do sistema"""
        try:
            cpu = psutil.cpu_percent(interval=0)
            ram = psutil.virtual_memory()
            disk = psutil.disk_usage('C:\\')
            return {
                "cpu": cpu,
                "ram_percent": ram.percent,
                "ram_used_gb": round(ram.used / (1024**3), 1),
                "ram_total_gb": round(ram.total / (1024**3), 1),
                "disk_percent": disk.percent,
                "disk_used_gb": round(disk.used / (1024**3), 1),
                "disk_total_gb": round(disk.total / (1024**3), 1)
            }
        except Exception as e:
            print(f"Erro ao obter system info: {e}")
            return {}

    async def send_heartbeat(self, websocket):
        while True:
            try:
                await websocket.send(json.dumps({
                    'type': 'heartbeat',
                    'macAddress': self.mac_address,
                    'ip': self.get_ip(),
                    'systemInfo': self.get_system_info(),
                    'audioDevices': self.get_audio_devices()
                }))
                await asyncio.sleep(10)
            except Exception:
                break

    async def send_feedback(self, websocket, command, success, message=""):
        """Envia feedback do comando ao servidor"""
        try:
            await websocket.send(json.dumps({
                'type': 'command-feedback',
                'macAddress': self.mac_address,
                'command': command,
                'success': success,
                'message': message
            }))
        except Exception:
            pass

    async def handle_command(self, command, params, websocket=None):
        print(f"\n>> Comando recebido: {command}")
        print(f"   Parametros: {params}")

        success = True
        message = "OK"

        try:
            if command == 'shutdown':
                await self.shutdown_pc(params.get('delay', 0))
            elif command == 'cancel-shutdown':
                await self.cancel_shutdown()
            elif command == 'restart':
                await self.restart_pc()
            elif command == 'cinema-mode':
                await self.cinema_mode()
            elif command == 'console-mode':
                await self.console_mode()
            elif command == 'retro-console':
                await self.retro_console_mode()
            elif command == 'night-mode':
                await self.night_mode()
            elif command == 'set-volume':
                await self.set_volume(params.get('volume', 50))
            elif command == 'mute':
                await self.toggle_mute()
            elif command == 'audio-output':
                await self.set_audio_output(params.get('device'))
            elif command == 'set-audio-device':
                await self.set_audio_output(params.get('device'))
            elif command == 'open-app':
                await self.open_application(params.get('app'))
            elif command == 'lock-pc':
                await self.lock_pc()
            elif command == 'sleep':
                await self.sleep_pc()
            elif command == 'monitor-off':
                await self.turn_off_monitor()
            elif command == 'media-play-pause':
                await self.media_control('playpause')
            elif command == 'media-next':
                await self.media_control('nexttrack')
            elif command == 'media-prev':
                await self.media_control('prevtrack')
            elif command == 'tts':
                await self.text_to_speech(params.get('text', ''))
            elif command == 'notification':
                await self.show_notification(params.get('message', 'Notificação'))
            else:
                print(f"  Comando desconhecido: {command}")
                success = False
                message = f"Comando desconhecido: {command}"

        except Exception as e:
            print(f"Erro ao executar comando: {e}")
            success = False
            message = str(e)

        if websocket:
            await self.send_feedback(websocket, command, success, message)

    # ===== COMANDOS DE SISTEMA =====

    async def shutdown_pc(self, delay_minutes=0):
        if self.shutdown_task:
            self.shutdown_task.cancel()

        if delay_minutes > 0:
            print(f"PC sera desligado em {delay_minutes} minutos...")
            self.shutdown_task = asyncio.create_task(
                self._delayed_shutdown(delay_minutes * 60)
            )
        else:
            print("Desligando PC AGORA...")
            os.system("shutdown /s /t 5")

    async def _delayed_shutdown(self, seconds):
        try:
            await asyncio.sleep(seconds)
            print("Executando shutdown...")
            os.system("shutdown /s /t 5")
        except asyncio.CancelledError:
            print("Shutdown cancelado!")

    async def cancel_shutdown(self):
        if self.shutdown_task:
            self.shutdown_task.cancel()
            self.shutdown_task = None
        os.system("shutdown /a")
        print("Shutdown cancelado!")

    async def restart_pc(self):
        print("Reiniciando PC...")
        os.system("shutdown /r /t 5")

    async def lock_pc(self):
        print("Bloqueando PC...")
        ctypes.windll.user32.LockWorkStation()

    async def sleep_pc(self):
        print("Entrando em modo suspensao...")
        os.system("rundll32.exe powrprof.dll,SetSuspendState 0,1,0")

    async def turn_off_monitor(self):
        print("Desligando monitor...")
        ctypes.windll.user32.SendMessageW(0xFFFF, 0x0112, 0xF170, 2)

    # ===== MODOS =====

    async def cinema_mode(self):
        print("Ativando modo cinema...")
        # Abrir YouTube no Brave
        brave_path = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
        if os.path.exists(brave_path):
            subprocess.Popen([brave_path, "--start-fullscreen", "https://youtube.com"])
        else:
            subprocess.Popen(["start", "https://youtube.com"], shell=True)

        # Volume confortável
        await self.set_volume(40)
        print("Modo cinema ativado!")

    async def console_mode(self):
        print("Iniciando Steam Big Picture...")
        steam_paths = [
            r"C:\Program Files (x86)\Steam\steam.exe",
            r"C:\Program Files\Steam\steam.exe",
        ]
        for path in steam_paths:
            if os.path.exists(path):
                subprocess.Popen([path, "-bigpicture"])
                print("Steam Big Picture iniciado!")
                return
        print("Steam nao encontrado!")

    async def retro_console_mode(self):
        print("Ativando modo console retro...")
        brave_path = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
        url = "http://192.168.0.225:1004/console"
        if os.path.exists(brave_path):
            subprocess.Popen([brave_path, "--start-fullscreen", url])
        else:
            subprocess.Popen(["start", url], shell=True)
        print("Modo retro console ativado!")

    async def night_mode(self):
        print("Ativando night mode...")
        await self.set_volume(15)
        # Desligar monitores secundários
        # os.system("displayswitch.exe /internal")
        await asyncio.sleep(1)
        await self.turn_off_monitor()
        print("Night mode ativado!")

    # ===== ÁUDIO =====

    def _get_volume_control(self):
        """Retorna IAudioEndpointVolume compatível com pycaw antigo e novo (AudioDevice wrapper)"""
        speakers = AudioUtilities.GetSpeakers()
        # pycaw >= 0.6 retorna AudioDevice wrapper; ._dev contém o IMMDevice real
        mmdevice = getattr(speakers, '_dev', speakers)
        interface = mmdevice.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
        return cast(interface, POINTER(IAudioEndpointVolume))

    async def set_volume(self, volume):
        volume_control = self._get_volume_control()
        volume_level = max(0, min(100, int(volume))) / 100.0
        volume_control.SetMasterVolumeLevelScalar(volume_level, None)
        print(f"Volume ajustado para {volume}%")

    async def toggle_mute(self):
        volume_control = self._get_volume_control()
        current_mute = volume_control.GetMute()
        volume_control.SetMute(not current_mute, None)
        state = "mutado" if not current_mute else "desmutado"
        print(f"Audio {state}!")

    async def set_audio_output(self, device_name):
        """Muda saída de áudio padrão via PolicyConfig COM API (sem dependências externas)"""
        print(f"Tentando mudar para: {device_name}")

        # Encontrar o device ID pelo nome usando pycaw
        target_id = None
        all_devices = AudioUtilities.GetAllDevices()
        for dev in all_devices:
            if dev.FriendlyName and device_name.lower() in dev.FriendlyName.lower():
                target_id = dev.id
                break

        if not target_id:
            raise Exception(f"Dispositivo de áudio não encontrado: {device_name}")

        # Mudar dispositivo padrão via PolicyConfig (COM interno do Windows, sem módulos extras)
        ps_script = r"""
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IPolicyConfig {
    void GetMixFormat(string s, IntPtr p);
    void GetDeviceFormat(string s, bool b, IntPtr p);
    void ResetDeviceFormat(string s);
    void SetDeviceFormat(string s, IntPtr p1, IntPtr p2);
    void GetProcessingPeriod(string s, bool b, out long l1, out long l2);
    void SetProcessingPeriod(string s, ref long l);
    void GetShareMode(string s, out uint m);
    void SetShareMode(string s, uint m);
    void GetPropertyValue(string s, bool b, IntPtr k, IntPtr v);
    void SetPropertyValue(string s, bool b, IntPtr k, IntPtr v);
    [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string devId, uint role);
    void SetEndpointVisibility(string s, bool v);
}
[ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
public class PolicyConfigClient {}
'@ -Language CSharp
$devId = $args[0]
$pc = New-Object PolicyConfigClient
$ipc = [IPolicyConfig]$pc
$ipc.SetDefaultEndpoint($devId, 0)
$ipc.SetDefaultEndpoint($devId, 1)
$ipc.SetDefaultEndpoint($devId, 2)
Write-Output "OK"
"""
        result = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script, target_id],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode == 0 and "OK" in result.stdout:
            print(f"Saída de áudio alterada para: {device_name}")
        else:
            raise Exception(f"PolicyConfig falhou: {result.stderr.strip() or result.stdout.strip()}")

    # ===== MÍDIA =====

    async def media_control(self, action):
        print(f"Media control: {action}")
        pyautogui.press(action)
        print(f"Media {action} executado!")

    # ===== TTS =====

    async def text_to_speech(self, text):
        if not text:
            print("Texto vazio para TTS")
            return
        print(f"TTS: {text}")
        try:
            import pyttsx3
            engine = pyttsx3.init()
            engine.setProperty('rate', 150)
            # Tentar voz em português
            voices = engine.getProperty('voices')
            for voice in voices:
                if 'brazil' in voice.name.lower() or 'portuguese' in voice.name.lower():
                    engine.setProperty('voice', voice.id)
                    break
            engine.say(text)
            engine.runAndWait()
            engine.stop()
            print("TTS concluido!")
        except Exception as e:
            print(f"Erro no TTS: {e}")

    # ===== NOTIFICAÇÃO =====

    async def show_notification(self, message):
        print(f"Notificacao: {message}")
        try:
            # Usar PowerShell para toast notification
            ps_script = f'''
            [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
            [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
            $template = @"
            <toast>
                <visual>
                    <binding template="ToastGeneric">
                        <text>PC Control</text>
                        <text>{message}</text>
                    </binding>
                </visual>
            </toast>
"@
            $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
            $xml.LoadXml($template)
            $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
            [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("PC Control").Show($toast)
            '''
            subprocess.run(
                ["powershell", "-Command", ps_script],
                capture_output=True, timeout=10
            )
            print("Notificacao enviada!")
        except Exception as e:
            print(f"Erro na notificacao: {e}")

    # ===== APPS =====

    async def open_application(self, app_name):
        print(f"Abrindo: {app_name}")
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
            'discord': lambda: subprocess.Popen([
                os.path.expanduser(r"~\AppData\Local\Discord\Update.exe"),
                "--processStart", "Discord.exe"
            ]),
        }

        app_lower = app_name.lower() if app_name else ""
        if app_lower in apps:
            try:
                apps[app_lower]()
                print(f"{app_name} aberto!")
            except Exception as e:
                print(f"Erro ao abrir {app_name}: {e}")
        else:
            print(f"App nao configurado: {app_name}")

    # ===== CONEXÃO =====

    async def connect(self):
        while True:
            try:
                print(f"\nConectando ao servidor: {SERVER_URL}")
                print(f"   MAC: {self.mac_address}")
                print(f"   IP: {self.ip}")
                print(f"   Hostname: {self.hostname}")

                async with websockets.connect(SERVER_URL) as websocket:
                    # Registrar no servidor
                    await websocket.send(json.dumps({
                        'type': 'register',
                        'macAddress': self.mac_address,
                        'ip': self.ip,
                        'hostname': self.hostname,
                        'audioDevices': self.get_audio_devices(),
                        'systemInfo': self.get_system_info()
                    }))

                    print("Conectado ao servidor!")

                    heartbeat_task = asyncio.create_task(
                        self.send_heartbeat(websocket)
                    )

                    async for message in websocket:
                        data = json.loads(message)

                        if data['type'] == 'command':
                            await self.handle_command(
                                data['command'],
                                data.get('params', {}),
                                websocket
                            )
                        elif data['type'] == 'registered':
                            print("Registrado com sucesso!")

            except websockets.exceptions.ConnectionClosed:
                print(f"Conexao perdida. Reconectando em {RECONNECT_DELAY}s...")
            except Exception as e:
                print(f"Erro: {e}")
                print(f"   Tentando novamente em {RECONNECT_DELAY}s...")

            await asyncio.sleep(RECONNECT_DELAY)


def main():
    print("=" * 60)
    print("  PC CONTROL CLIENT")
    print("=" * 60)

    client = PCControlClient()

    try:
        asyncio.run(client.connect())
    except KeyboardInterrupt:
        print("\n\nCliente encerrado pelo usuario")


if __name__ == "__main__":
    main()
