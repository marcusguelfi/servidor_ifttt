"""
PC Control Client
Cliente para Windows que executa comandos remotos via WebSocket.
Configuração em config.json (gerado pelo install.bat).
"""

import sys
import asyncio
import json
import os
import socket
import uuid

import websockets
import psutil

# Pyautogui sem failsafe e sem pausa entre chamadas (mouse-move contínuo)
import pyautogui
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0

# Carregar registry de comandos
from commands import COMMANDS, load_all
load_all()

# ──────────────────────────────────────────────
# Configuração (config.json ao lado deste arquivo)
# ──────────────────────────────────────────────
_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")

def _load_config() -> dict:
    if os.path.exists(_CONFIG_PATH):
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

_config = _load_config()
SERVER_URL     = _config.get("server_url", "ws://192.168.0.225:3000")
USER_TOKEN     = _config.get("user_token", "")
RECONNECT_DELAY = 5


# ──────────────────────────────────────────────
# Cliente principal
# ──────────────────────────────────────────────

class PCControlClient:
    def __init__(self):
        self.mac_address   = self._get_mac_address()
        self.hostname      = socket.gethostname()
        self.ip            = self._get_ip()
        self.shutdown_task = None   # usado por commands/system.py

    # ── identificação ──

    def _get_mac_address(self) -> str:
        return ':'.join([
            '{:02x}'.format((uuid.getnode() >> e) & 0xff)
            for e in range(0, 2 * 6, 2)
        ][::-1])

    def _get_ip(self) -> str:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    # ── dados do sistema ──

    def get_audio_devices(self) -> list:
        devices = []
        try:
            from pycaw.pycaw import AudioUtilities
            for i, dev in enumerate(AudioUtilities.GetAllDevices(data_flow=0, device_state=1)):
                if dev.FriendlyName:
                    devices.append({"index": i, "name": dev.FriendlyName, "id": dev.id})
        except Exception as e:
            print(f"Erro ao listar devices: {e}")
        return devices

    def get_system_info(self) -> dict:
        try:
            cpu = psutil.cpu_percent(interval=0)
            ram = psutil.virtual_memory()
            disks = []
            for part in psutil.disk_partitions(all=False):
                if not part.fstype or 'cdrom' in part.opts:
                    continue
                try:
                    u = psutil.disk_usage(part.mountpoint)
                    disks.append({
                        "mount": part.mountpoint,
                        "percent": u.percent,
                        "used_gb": round(u.used / 1024**3, 1),
                        "total_gb": round(u.total / 1024**3, 1),
                    })
                except Exception:
                    continue
            first = disks[0] if disks else {"percent": 0, "used_gb": 0, "total_gb": 0}
            return {
                "cpu": cpu,
                "ram_percent": ram.percent,
                "ram_used_gb": round(ram.used / 1024**3, 1),
                "ram_total_gb": round(ram.total / 1024**3, 1),
                "disk_percent": first["percent"],
                "disk_used_gb": first["used_gb"],
                "disk_total_gb": first["total_gb"],
                "disks": disks,
            }
        except Exception as e:
            print(f"Erro ao obter system info: {e}")
            return {}

    # ── heartbeat e feedback ──

    async def send_heartbeat(self, websocket):
        while True:
            try:
                await websocket.send(json.dumps({
                    'type':         'heartbeat',
                    'macAddress':   self.mac_address,
                    'token':        USER_TOKEN,
                    'ip':           self._get_ip(),
                    'systemInfo':   self.get_system_info(),
                    'audioDevices': self.get_audio_devices(),
                }))
                await asyncio.sleep(10)
            except Exception:
                break

    async def send_feedback(self, websocket, command, success, message=""):
        try:
            await websocket.send(json.dumps({
                'type':       'command-feedback',
                'macAddress': self.mac_address,
                'command':    command,
                'success':    success,
                'message':    message,
            }))
        except Exception:
            pass

    # ── dispatcher de comandos (usa registry) ──

    async def handle_command(self, command, params, websocket=None):
        print(f"\n>> Comando: {command}  params={params}")
        success = True
        message = "OK"
        try:
            handler = COMMANDS.get(command)
            if handler:
                await handler(self, params)
            else:
                print(f"  Comando desconhecido: {command}")
                success = False
                message = f"Comando desconhecido: {command}"
        except Exception as e:
            print(f"Erro ao executar '{command}': {e}")
            success = False
            message = str(e)
        if websocket:
            await self.send_feedback(websocket, command, success, message)

    # ── conexão WebSocket ──

    async def connect(self):
        while True:
            try:
                print(f"\nConectando: {SERVER_URL}")
                print(f"  MAC:      {self.mac_address}")
                print(f"  IP:       {self.ip}")
                print(f"  Hostname: {self.hostname}")
                if USER_TOKEN:
                    print(f"  Token:    {USER_TOKEN[:8]}...")

                async with websockets.connect(SERVER_URL) as ws:
                    await ws.send(json.dumps({
                        'type':         'register',
                        'macAddress':   self.mac_address,
                        'token':        USER_TOKEN,
                        'ip':           self.ip,
                        'hostname':     self.hostname,
                        'audioDevices': self.get_audio_devices(),
                        'systemInfo':   self.get_system_info(),
                    }))

                    heartbeat = asyncio.create_task(self.send_heartbeat(ws))

                    async for message in ws:
                        data = json.loads(message)
                        if data['type'] == 'command':
                            await self.handle_command(
                                data['command'],
                                data.get('params', {}),
                                ws
                            )
                        elif data['type'] == 'registered':
                            print(f"Registrado com sucesso! Comandos disponiveis: {len(COMMANDS)}")

            except websockets.exceptions.ConnectionClosed:
                print(f"Conexao perdida. Reconectando em {RECONNECT_DELAY}s...")
            except Exception as e:
                print(f"Erro: {e}")

            await asyncio.sleep(RECONNECT_DELAY)


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────

if __name__ == '__main__':
    # Garantir UTF-8 no console Windows
    if sys.stdout.encoding != 'utf-8':
        sys.stdout.reconfigure(encoding='utf-8')
    if sys.stderr.encoding != 'utf-8':
        sys.stderr.reconfigure(encoding='utf-8')

    print("PC Control Client")
    print(f"Comandos carregados: {list(COMMANDS.keys())}")
    client = PCControlClient()
    asyncio.run(client.connect())
