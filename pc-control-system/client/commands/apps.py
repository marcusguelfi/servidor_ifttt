import os
import asyncio
import ctypes
import subprocess

import pyautogui

from commands import register


def _find_window_by_title(partial):
    result = []
    user32 = ctypes.windll.user32
    WNDENUMPROC = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    def callback(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            length = user32.GetWindowTextLengthW(hwnd)
            if length > 0:
                buf = ctypes.create_unicode_buffer(length + 1)
                user32.GetWindowTextW(hwnd, buf, length + 1)
                if partial.lower() in buf.value.lower():
                    result.append(hwnd)
        return True

    ctypes.windll.user32.EnumWindows(WNDENUMPROC(callback), 0)
    return result[0] if result else None


def _open_lol():
    for path in [
        r"C:\Riot Games\Riot Client\RiotClientServices.exe",
        r"C:\Program Files\Riot Games\Riot Client\RiotClientServices.exe",
    ]:
        if os.path.exists(path):
            subprocess.Popen([path, "--launch-product=league_of_legends", "--launch-patchline=live"])
            print("LoL iniciado via Riot Client!")
            return
    for path in [
        r"C:\Riot Games\League of Legends\LeagueClient.exe",
        r"C:\Program Files\Riot Games\League of Legends\LeagueClient.exe",
        r"C:\Program Files (x86)\Riot Games\League of Legends\LeagueClient.exe",
    ]:
        if os.path.exists(path):
            subprocess.Popen([path])
            print("LoL iniciado!")
            return
    print("League of Legends nao encontrado!")


@register('open-app')
async def open_app(client, params):
    app_name = (params.get('app') or '').lower()
    brave = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
    apps = {
        'youtube':  lambda: subprocess.Popen([brave, "https://youtube.com"]),
        'brave':    lambda: subprocess.Popen([brave]),
        'league':   _open_lol,
        'lol':      _open_lol,
        'steam':    lambda: subprocess.Popen([r"C:\Program Files (x86)\Steam\steam.exe"]),
        'ytmusic':  lambda: subprocess.Popen([brave, "https://music.youtube.com"]),
        'discord':  lambda: subprocess.Popen([
            os.path.expanduser(r"~\AppData\Local\Discord\Update.exe"),
            "--processStart", "Discord.exe"
        ]),
    }
    if app_name in apps:
        try:
            apps[app_name]()
            print(f"{app_name} aberto!")
        except Exception as e:
            print(f"Erro ao abrir {app_name}: {e}")
    else:
        print(f"App nao configurado: {app_name}")


@register('open-url')
async def open_url(client, params):
    url = params.get('url', '')
    if url:
        brave = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
        if os.path.exists(brave):
            subprocess.Popen([brave, url])
        else:
            subprocess.Popen(["start", url], shell=True)
        print(f"URL aberta: {url}")


@register('claude-yes')
async def claude_yes(client, params):
    for title in ["Claude", "Windows Terminal", "cmd"]:
        hwnd = _find_window_by_title(title)
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 9)
            ctypes.windll.user32.SetForegroundWindow(hwnd)
            await asyncio.sleep(0.3)
            break
    pyautogui.press('enter')
    print("Enter enviado ao terminal!")
