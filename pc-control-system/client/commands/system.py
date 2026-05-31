import os
import asyncio
import ctypes
import subprocess

from commands import register


@register('shutdown')
async def shutdown(client, params):
    delay = params.get('delay', 0)
    if client.shutdown_task:
        client.shutdown_task.cancel()
    if delay > 0:
        print(f"PC sera desligado em {delay} minutos...")
        client.shutdown_task = asyncio.create_task(_delayed_shutdown(delay * 60))
    else:
        print("Desligando PC AGORA...")
        await asyncio.sleep(1)
        os.system("shutdown /s /t 5")


async def _delayed_shutdown(seconds):
    try:
        await asyncio.sleep(seconds)
        print("Executando shutdown...")
        os.system("shutdown /s /t 5")
    except asyncio.CancelledError:
        print("Shutdown cancelado!")


@register('cancel-shutdown')
async def cancel_shutdown(client, params):
    if client.shutdown_task:
        client.shutdown_task.cancel()
        client.shutdown_task = None
    os.system("shutdown /a")
    print("Shutdown cancelado!")


@register('restart')
async def restart(client, params):
    print("Reiniciando PC...")
    os.system("shutdown /r /t 5")


@register('lock-pc')
async def lock_pc(client, params):
    print("Bloqueando PC...")
    ctypes.windll.user32.LockWorkStation()


@register('sleep')
async def sleep_pc(client, params):
    print("Entrando em modo suspensao...")
    await asyncio.sleep(1)
    subprocess.Popen([
        "powershell", "-Command",
        "Add-Type -AssemblyName System.Windows.Forms; "
        "[System.Windows.Forms.Application]::SetSuspendState('Suspend', $false, $false)"
    ])


@register('monitor-off')
async def monitor_off(client, params):
    print("Desligando monitor...")
    ctypes.windll.user32.SendMessageW(0xFFFF, 0x0112, 0xF170, 2)
