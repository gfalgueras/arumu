#!/bin/bash

echo "===================================================="
echo "  Instalador de Dependencias - Arumu (Linux)"
echo "===================================================="

# Comprobar si pnpm está instalado
if ! command -v pnpm &> /dev/null
then
    echo "[ADVERTENCIA] No se detectó pnpm. Intentando instalar pnpm usando npm..."
    if ! command -v npm &> /dev/null
    then
        echo "[ERROR] npm y Node.js no están instalados. Por favor, instala Node.js primero."
        exit 1
    fi
    npm install -g pnpm
fi

echo -e "\n[1/2] Instalando dependencias del proyecto con pnpm..."
pnpm install

if [ $? -ne 0 ]; then
    echo -e "\n[ERROR] Hubo un problema al instalar las dependencias."
    exit 1
fi

echo -e "\n[2/2] Dependencias instaladas correctamente."
echo ""
echo "===================================================="
echo " Puedes iniciar la aplicación de desarrollo usando:"
echo "    pnpm run dev"
echo "===================================================="
