"""
Comandos de gaming: game-mode e dev-mode.
Executa os scripts PowerShell em C:\\Users\\marcu\\Scripts\\.
Para adicionar um novo modo: copie esse arquivo, crie o PS1 em Scripts/ e registre com @register.
"""
import subprocess

from commands import register

_SCRIPTS = r"C:\Users\marcu\Scripts"


@register('game-mode')
async def game_mode(client, params):
    print("Ativando Game Mode...")
    subprocess.Popen([
        "powershell", "-ExecutionPolicy", "Bypass", "-File",
        rf"{_SCRIPTS}\game-mode.ps1"
    ])
    print("Game Mode iniciado!")


@register('dev-mode')
async def dev_mode(client, params):
    print("Ativando Dev Mode...")
    subprocess.Popen([
        "powershell", "-ExecutionPolicy", "Bypass", "-File",
        rf"{_SCRIPTS}\dev-mode.ps1"
    ])
    print("Dev Mode iniciado!")
