@echo off
echo ========================================
echo   PC CONTROL CLIENT - INSTALADOR
echo ========================================
echo.

:: Verificar se Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python nao encontrado!
    echo Por favor, instale Python 3.8+ de https://python.org
    pause
    exit /b 1
)

echo [OK] Python encontrado!
echo.

:: Instalar dependências
echo Instalando dependencias...
pip install -r requirements.txt

if errorlevel 1 (
    echo [ERRO] Falha ao instalar dependencias
    pause
    exit /b 1
)

echo.
echo [OK] Dependencias instaladas com sucesso!
echo.

:: Configurar IP do servidor
echo ========================================
echo   CONFIGURACAO
echo ========================================
echo.
set /p SERVER_IP="Digite o IP do seu servidor: "

:: Atualizar IP no arquivo Python
powershell -Command "(gc pc_client.py) -replace 'SERVER_URL = \"ws://SEU_SERVIDOR_IP:3000\"', 'SERVER_URL = \"ws://%SERVER_IP%:3000\"' | Out-File -encoding ASCII pc_client.py"

echo.
echo [OK] Configuracao concluida!
echo.

:: Criar atalho para inicialização automática
echo Deseja criar atalho na inicializacao automatica? (S/N)
set /p AUTO_START=""

if /i "%AUTO_START%"=="S" (
    :: Criar VBS para executar em background
    echo Set WshShell = CreateObject("WScript.Shell") > run_client.vbs
    echo WshShell.Run "python ""%CD%\pc_client.py""", 0, False >> run_client.vbs
    
    :: Criar atalho na pasta de inicialização
    set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
    powershell "$s=(New-Object -COM WScript.Shell).CreateShortcut('%STARTUP_FOLDER%\PCControl.lnk');$s.TargetPath='%CD%\run_client.vbs';$s.Save()"
    
    echo [OK] Atalho criado na inicializacao!
)

echo.
echo ========================================
echo   INSTALACAO CONCLUIDA!
echo ========================================
echo.
echo Para iniciar o cliente agora, execute:
echo   python pc_client.py
echo.
echo Ou use o atalho: run_client.vbs
echo.
pause
