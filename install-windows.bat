@echo off
echo ====================================================
echo   Instalador de Dependencias - Arumu (Windows)
echo ====================================================

:: Comprobar si pnpm esta instalado
where pnpm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ADVERTENCIA] No se detecto pnpm. Intentando usar npm para instalar pnpm...
    call npm install -g pnpm
    if %errorlevel% neq 0 (
        echo [ERROR] No se pudo instalar pnpm. Asegurate de tener Node.js instalado en tu sistema.
        pause
        exit /b 1
    )
)

echo.
echo [1/2] Instalando dependencias del proyecto con pnpm...
call pnpm install

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Hubo un problema al instalar las dependencias.
    pause
    exit /b 1
)

echo.
echo [2/2] Dependencias instaladas correctamente.
echo.
echo ====================================================
echo Puedes iniciar la aplicacion en modo desarrollo usando:
echo    pnpm run dev
echo ====================================================
pause
