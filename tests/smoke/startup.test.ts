import { GenericContainer } from 'testcontainers'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const ELECTRON_DIST = resolve(ROOT, 'node_modules/electron/dist')
const OUT_DIR = resolve(ROOT, 'out')

const ERROR_PATTERNS = ['Cannot find module', 'ReferenceError', 'Uncaught Exception']

function electronVersion(): string {
  return JSON.parse(readFileSync(resolve(ROOT, 'node_modules/electron/package.json'), 'utf8')).version
}

const DEFAULT_RUN = 'timeout 8 xvfb-run -a /electron/electron /app/out/main/index.cjs --no-sandbox 2>&1 || true'

const DISTROS: Array<{ name: string; image: string; deps: string; electronCmd?: string; timeout?: number }> = [
  {
    name: 'fedora',
    image: 'fedora:41',
    deps: 'dnf install -y --setopt=install_weak_deps=False xorg-x11-server-Xvfb gtk3 libnotify nss libXScrnSaver alsa-lib libXtst curl unzip',
  },
  {
    name: 'debian-12',
    image: 'debian:12-slim',
    deps: 'DEBIAN_FRONTEND=noninteractive apt-get update -qq && apt-get install -y --no-install-recommends xvfb libgtk-3-0 libnotify-dev libnss3 libxss1 libasound2 libxtst6 curl unzip',
  },
  {
    name: 'archlinux',
    image: 'archlinux:latest',
    deps: 'pacman -Sy --noconfirm xorg-server-xvfb gtk3 libnotify nss libxss alsa-lib libxtst curl unzip',
    electronCmd: 'Xvfb :99 -screen 0 1024x768x24 & XPID=$!; sleep 1; DISPLAY=:99 timeout 8 /electron/electron /app/out/main/index.cjs --no-sandbox 2>&1; kill $XPID 2>/dev/null; true',
    timeout: 300_000,
  },
  {
    name: 'redhat-ubi9',
    image: 'redhat/ubi9',
    deps: 'dnf install -y --setopt=install_weak_deps=False xorg-x11-server-Xvfb gtk3 libnotify nss libXScrnSaver alsa-lib libXtst curl unzip',
  },
]

describe.concurrent('startup smoke', () => {
  for (const distro of DISTROS) {
    it(`[${distro.name}] starts without JS errors`, { timeout: distro.timeout ?? 120_000 }, async ({ skip }) => {
      if (!existsSync(resolve(OUT_DIR, 'main/index.cjs'))) skip()

      const linuxHost = process.platform === 'linux'
      const elVersion = electronVersion()

      const container = await new GenericContainer(distro.image)
        .withBindMounts([
          { source: OUT_DIR, target: '/app/out', mode: 'ro' },
          ...(linuxHost ? [{ source: ELECTRON_DIST, target: '/electron', mode: 'ro' as const }] : []),
        ])
        .withCommand(['sh', '-c', 'sleep infinity'])
        .start()

      try {
        await container.exec(['sh', '-c', distro.deps])

        if (!linuxHost) {
          // Linux electron binary not on host (Windows/Mac) — download inside container
          await container.exec(['sh', '-c',
            `curl -sL https://github.com/electron/electron/releases/download/v${elVersion}/electron-v${elVersion}-linux-x64.zip` +
            ` -o /tmp/el.zip && unzip -q /tmp/el.zip -d /electron && chmod +x /electron/electron`,
          ])
        }

        const { output } = await container.exec([
          'sh', '-c',
          distro.electronCmd ?? DEFAULT_RUN,
        ])

        for (const pattern of ERROR_PATTERNS) {
          expect(output, `[${distro.name}] ${pattern}\n\n${output}`).not.toContain(pattern)
        }
      } finally {
        await container.stop()
      }
    })
  }
})
