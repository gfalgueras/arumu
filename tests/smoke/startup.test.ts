import { GenericContainer } from 'testcontainers'
import { existsSync, readFileSync, mkdirSync, statSync } from 'fs'
import { writeFile } from 'fs/promises'
import { resolve } from 'path'
import { describe, it, expect, beforeAll } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const ELECTRON_DIST = resolve(ROOT, 'node_modules/electron/dist')
const OUT_DIR = resolve(ROOT, 'out')
const CACHE_DIR = resolve(ROOT, 'node_modules/.cache/electron-smoke')

const ERROR_PATTERNS = ['Cannot find module', 'ReferenceError', 'Uncaught Exception']

function electronVersion(): string {
  return JSON.parse(readFileSync(resolve(ROOT, 'node_modules/electron/package.json'), 'utf8')).version
}

// Downloaded once and bind-mounted into every container, instead of each of
// the N distro containers curl-ing its own ~100MB copy concurrently — that
// redundant simultaneous network load was blowing past the per-test timeout.
async function ensureElectronZipCached(elVersion: string): Promise<string> {
  const zipPath = resolve(CACHE_DIR, `electron-v${elVersion}-linux-x64.zip`)
  if (existsSync(zipPath) && statSync(zipPath).size > 0) return zipPath

  mkdirSync(CACHE_DIR, { recursive: true })
  const url = `https://github.com/electron/electron/releases/download/v${elVersion}/electron-v${elVersion}-linux-x64.zip`
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Failed to download Electron zip: ${res.status} ${res.statusText}`)
  await writeFile(zipPath, Buffer.from(await res.arrayBuffer()))
  return zipPath
}

// --disable-gpu / --disable-dev-shm-usage: containers have no GPU and Docker's
// default 64MB /dev/shm is too small for Chromium, both cause hard crashes
// (segfault) rather than a clean error — which then triggers a 50GB+ WSL
// core dump per crash. `ulimit -c 0` is a belt-and-suspenders guard so even
// an unrelated future crash here doesn't write one.
const ELECTRON_FLAGS = '--no-sandbox --disable-gpu --disable-dev-shm-usage'
const DEFAULT_RUN = `ulimit -c 0; timeout 8 xvfb-run -a /electron/electron /app/out/main/index.cjs ${ELECTRON_FLAGS} 2>&1 || true`

// archlinux dropped: its Electron process reliably crashed here (multiple 50-80GB
// WSL core dumps), not worth the disk risk to keep chasing on this host.
const DISTROS: Array<{ name: string; image: string; deps: string }> = [
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
    name: 'redhat-ubi9',
    image: 'redhat/ubi9',
    deps: 'dnf install -y --setopt=install_weak_deps=False xorg-x11-server-Xvfb gtk3 libnotify nss libXScrnSaver alsa-lib libXtst curl unzip',
  },
]

const linuxHost = process.platform === 'linux'
let electronZipHostPath: string | null = null

beforeAll(async () => {
  if (!linuxHost) {
    electronZipHostPath = await ensureElectronZipCached(electronVersion())
  }
})

describe.concurrent('startup smoke', () => {
  for (const distro of DISTROS) {
    it(`[${distro.name}] starts without JS errors`, { timeout: 120_000 }, async ({ skip }) => {
      if (!existsSync(resolve(OUT_DIR, 'main/index.cjs'))) skip()

      const container = await new GenericContainer(distro.image)
        .withBindMounts([
          { source: OUT_DIR, target: '/app/out', mode: 'ro' },
          ...(linuxHost
            ? [{ source: ELECTRON_DIST, target: '/electron', mode: 'ro' as const }]
            : [{ source: electronZipHostPath!, target: '/tmp/el.zip', mode: 'ro' as const }]),
        ])
        .withCommand(['sh', '-c', 'sleep infinity'])
        .start()

      try {
        await container.exec(['sh', '-c', distro.deps])

        if (!linuxHost) {
          // Electron binary not on host (Windows/Mac) — unzip the shared, pre-downloaded copy
          await container.exec(['sh', '-c', 'unzip -q /tmp/el.zip -d /electron && chmod +x /electron/electron'])
        }

        const { output } = await container.exec(['sh', '-c', DEFAULT_RUN])

        for (const pattern of ERROR_PATTERNS) {
          expect(output, `[${distro.name}] ${pattern}\n\n${output}`).not.toContain(pattern)
        }
      } finally {
        await container.stop()
      }
    })
  }
})
