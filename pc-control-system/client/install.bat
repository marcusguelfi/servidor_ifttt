@echo off
chcp 65001 > nul
echo ========================================
echo   PC CONTROL CLIENT - INSTALADOR
echo ========================================
echo.

:: Verificar Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python nao encontrado!
    echo Instale Python 3.8+ de https://python.org
    pause
    exit /b 1
)
echo [OK] Python encontrado!
echo.

:: Instalar dependencias
echo Instalando dependencias...
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias
    pause
    exit /b 1
)
echo.
echo [OK] Dependencias instaladas!
echo.

:: Mostrar configuracao atual (config.json ja vem pronto do download)
echo Configuracao atual:
python -c "import json; c=json.load(open('config.json')); print('  Servidor: ' + c.get('server_url','?')); print('  Token:    ' + c.get('user_token','?')[:12] + '...')"
echo.

:: Recriar run_client.vbs via PowerShell (evita bugs com ) e acentos no CMD)
powershell -NoProfile -Command ^
    "$vbs = 'Set WshShell = CreateObject(""WScript.Shell"")' + [char]13 + [char]10 + 'WshShell.Run ""python """""""" & Replace(WScript.ScriptFullName, ""run_client.vbs"", ""pc_client.py"") & """""""", 0, False'; [System.IO.File]::WriteAllText([System.IO.Path]::Combine((Get-Location).Path, 'run_client.vbs'), $vbs, [System.Text.Encoding]::ASCII)"

echo [OK] run_client.vbs criado!
echo.

:: Criar atalho na inicializacao automatica
set /p AUTO_START="Iniciar com o Windows automaticamente? (S/N): "

if /i "%AUTO_START%"=="S" (
    set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
    powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut('%STARTUP%\PCControl.lnk'); $s.TargetPath=[System.IO.Path]::Combine((Get-Location).Path,'run_client.vbs'); $s.Save()"
    echo [OK] Atalho criado na inicializacao!
)

echo.
echo ========================================
echo   INSTALACAO CONCLUIDA!
echo ========================================
echo.
echo Para iniciar agora:
echo   python pc_client.py
echo.
echo Para iniciar em background:
echo   run_client.vbs
echo.
pause
