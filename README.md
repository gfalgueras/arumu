# Arumu - Gestor de Consultas SQL

Arumu es una aplicación de escritorio moderna y rápida para interactuar con bases de datos MySQL, diseñada para mejorar el flujo de trabajo de desarrolladores y administradores de bases de datos. Desarrollada con tecnologías web modernas, ofrece una interfaz de usuario atractiva y un potente editor SQL.

## 🚀 Tecnologías

Esta aplicación está construida sobre un stack robusto y moderno:
- **Electron**: Para empaquetar la aplicación multiplataforma.
- **Vue 3**: Framework progresivo de JavaScript para las interfaces.
- **TailwindCSS**: Framework de CSS para diseño rápido y moderno.
- **CodeMirror 6**: Potente editor de texto con soporte avanzado para SQL (autocompletado, resaltado de sintaxis).
- **MySQL2**: Driver de alto rendimiento para conexión directa a bases de datos.
- **Vite & Electron-Vite**: Herramientas de compilación ultrarrápidas.

## ✨ Funcionalidades Principales

- 🔌 **Conexión Directa a MySQL**: Conéctate a tus bases de datos locales o remotas de forma segura.
- 📝 **Editor Avanzado de SQL**: Escribe consultas con autocompletado inteligente y resaltado de sintaxis.
- 🎨 **Interfaz de Usuario Moderna**: Una experiencia de usuario pulida y responsive, impulsada por Vue y TailwindCSS.
- ⚡ **Alta Performance**: Diseñada para consultas eficientes y tiempos de carga reducidos.
- 📦 **Multiplataforma**: Disponible en Windows, macOS y Linux.

## ⚙️ Requisitos Previos

Antes de comenzar, asegúrate de tener instalado en tu sistema:
- [Node.js](https://nodejs.org/) (Versión 18 o superior recomendada)
- [pnpm](https://pnpm.io/es/) (Gestor de paquetes recomendado para este proyecto)

Puedes instalar pnpm globalmente con:
```bash
npm install -g pnpm
```

## 🛠️ Instalación y Uso

Hemos provisto scripts automáticos de configuración para tu sistema operativo preferido. Estos scripts instalarán las dependencias necesarias.

### Opción 1: Usa los scripts de instalación (Recomendado)

Ejecuta el script correspondiente a tu sistema operativo (situados en la raíz del proyecto):

- **Windows**: Haz doble clic en `install-windows.bat` o ejecútalo desde tu consola.
- **Linux**: Ejecuta `bash install-linux.sh`
- **macOS**: Ejecuta `bash install-macos.sh`

*(Nota en Mac/Linux: Es posible que necesites darles permisos de ejecución primero con `chmod +x install-linux.sh` o `chmod +x install-macos.sh`).*

### Opción 2: Instalación Manual

1. Clona el repositorio u obtén el código fuente.
2. Abre una terminal en la raíz del proyecto.
3. Instala las dependencias ejecutando:
   ```bash
   pnpm install
   ```

## 🏃 Modo de Desarrollo

Una vez instaladas las dependencias, inicia la aplicación en modo desarrollo (con recarga en caliente de módulos):

```bash
pnpm run dev
```

## 📦 Compilación para Producción

Para compilar y empaquetar la aplicación y generar los instaladores según tu sistema operativo local, ejecuta:

```bash
pnpm run dist
```

## 📜 Licencia

ISC
