import os
import asyncio
import ctypes
import subprocess
import winreg

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


def _set_night_light(enable: bool):
    key_path = (
        r"Software\Microsoft\Windows\CurrentVersion\CloudStore\Store"
        r"\DefaultAccount\Current"
        r"\default$windows.data.bluelightreduction.bluelightreductionstate"
        r"\windows.data.bluelightreduction.bluelightreductionstate"
    )
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_ALL_ACCESS) as key:
            data = bytearray(winreg.QueryValueEx(key, "Data")[0])
            data[18] = 0x13 if enable else 0x10
            winreg.SetValueEx(key, "Data", 0, winreg.REG_BINARY, bytes(data))
        ctypes.windll.user32.SendNotifyMessageW(0xFFFF, 0x001A, 0, "ImmersiveColorSet")
        print(f"Luz noturna {'ativada' if enable else 'desativada'}!")
    except Exception as e:
        print(f"Erro ao configurar luz noturna: {e}")


@register('cinema-mode')
async def cinema_mode(client, params):
    print("Ativando modo cinema...")
    from commands.audio import set_volume
    hwnd = _find_window_by_title("YouTube")
    if hwnd:
        ctypes.windll.user32.ShowWindow(hwnd, 9)
        ctypes.windll.user32.SetForegroundWindow(hwnd)
        await asyncio.sleep(0.5)
    else:
        brave = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
        if os.path.exists(brave):
            subprocess.Popen([brave, "--new-window", "https://youtube.com"])
        else:
            subprocess.Popen(["start", "https://youtube.com"], shell=True)
        await asyncio.sleep(3)
    pyautogui.press('f11')
    await asyncio.sleep(0.5)
    subprocess.Popen(["DisplaySwitch.exe", "/external"])
    await set_volume(client, {'volume': 40})
    print("Modo cinema ativado!")


@register('console-mode')
async def console_mode(client, params):
    print("Iniciando Steam Big Picture...")
    for path in [r"C:\Program Files (x86)\Steam\steam.exe", r"C:\Program Files\Steam\steam.exe"]:
        if os.path.exists(path):
            subprocess.Popen([path, "-gamepadui"])
            print("Steam Big Picture iniciado!")
            return
    subprocess.Popen(["start", "steam://open/bigpicture"], shell=True)


@register('retro-console')
async def retro_console(client, params):
    print("Ativando modo console retro...")
    brave = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
    url = "http://192.168.0.225:1004/console"
    if os.path.exists(brave):
        subprocess.Popen([brave, "--start-fullscreen", url])
    else:
        subprocess.Popen(["start", url], shell=True)
    print("Modo retro console ativado!")


@register('night-mode')
async def night_mode(client, params):
    print("Ativando night mode...")
    from commands.audio import set_volume
    await set_volume(client, {'volume': 15})
    _set_night_light(True)
    subprocess.Popen(["DisplaySwitch.exe", "/external"])
    print("Night mode ativado!")


@register('dual-monitor')
async def dual_monitor(client, params):
    print("Ativando duplo monitor...")
    subprocess.Popen(["DisplaySwitch.exe", "/extend"])
    print("Modo estendido ativado!")


@register('fullscreen')
async def fullscreen(client, params):
    pyautogui.press('f11')
    print("Fullscreen alternado!")


@register('video-fullscreen')
async def video_fullscreen(client, params):
    pyautogui.press('f')
    print("Video fullscreen alternado!")
