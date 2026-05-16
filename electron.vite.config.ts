import { resolve } from 'path'
import { builtinModules } from 'module'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// Only externalize electron, Node built-ins, and native addons (oracledb has .node files).
// Everything else (mysql2, pg, mssql, ...) is bundled into out/main/index.js so
// electron-builder doesn't need to resolve pnpm's symlink tree at package time.
const NATIVE_EXTERNALS = ['electron', 'oracledb', ...builtinModules, ...builtinModules.map(m => `node:${m}`)]

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: NATIVE_EXTERNALS
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  }
})
