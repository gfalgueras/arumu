# Arumu - SQL Manager

Inspired by HeidiSQL, Arumu is a modern and fast desktop application for interacting with SQL databases, designed to enhance the workflow of developers and database administrators. Built with modern web technologies, it features an attractive user interface and a powerful SQL editor.

## 🚀 Technologies

This application is built on a robust and modern stack:
- **Electron**: For cross-platform application packaging.
- **Vue 3**: Progressive JavaScript framework for the interfaces.
- **TailwindCSS**: CSS framework for rapid and modern design.
- **CodeMirror 6**: Powerful text editor with advanced support for SQL (autocomplete, syntax highlighting).
- **MySQL2**: High-performance driver for direct database connections.
- **Vite & Electron-Vite**: Lightning-fast build tools.

## ✨ Key Features

- 📝 **Advanced SQL Editor**: Write queries with smart auto-completion and syntax highlighting.
- 🎨 **Modern User Interface**: A polished and responsive user experience, powered by Vue and TailwindCSS.
- ⚡ **High Performance**: Designed for efficient queries and reduced loading times.
- 📦 **Cross-Platform**: Available on Windows, macOS, and Linux.

## ⚙️ Prerequisites

Before you start, make sure you have the following installed on your system:
- [Node.js](https://nodejs.org/) (Version 18 or higher recommended)
- [pnpm](https://pnpm.io/) (Recommended package manager for this project)

You can install pnpm globally with:
```bash
npm install -g pnpm
```

## 🛠️ Installation and Usage

We have provided automatic setup scripts for your preferred operating system. These scripts will install the necessary dependencies.

### Option 1: Use the installation scripts (Recommended)

Run the script corresponding to your operating system (located in the project root):

- **Windows**: Double-click `install-windows.bat` or run it from your console.
- **Linux**: Run `bash install-linux.sh`
- **macOS**: Run `bash install-macos.sh`

*(Note for Mac/Linux: You may need to grant execution permissions first with `chmod +x install-linux.sh` or `chmod +x install-macos.sh`).*

### Option 2: Manual Installation

1. Clone the repository or get the source code.
2. Open a terminal in the project root.
3. Install dependencies by running:
   ```bash
   pnpm install
   ```

## 🏃 Development Mode

Once dependencies are installed, start the application in development mode (with hot module replacement):

```bash
pnpm run dev
```

## 📦 Production Build

To compile and package the application and generate installers for your local operating system, run:

```bash
pnpm run dist
```

## 📜 License

ISC
