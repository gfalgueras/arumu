# Preload Script (`src/preload/index.ts`)

Bridges renderer and main process securely via Electron's `contextBridge`.

## Exposed API

```ts
window.electronAPI = {
  invoke(channel: string, ...args: any[]): Promise<any>,
  on(channel: string, callback: (...args: any[]) => void): () => void,
}
```

## Security Model

- Only channels in `ALLOWED_INVOKE_CHANNELS` can be called via `invoke`.
- Only channels in `ALLOWED_ON_CHANNELS` can be subscribed via `on`.
- Any other channel throws immediately in the renderer.

## Adding a New IPC Channel

**Always update this file when adding a new channel.** Adding to `main/index.ts` alone is not enough.

```ts
const ALLOWED_INVOKE_CHANNELS = new Set([
  // ... existing channels ...
  'api:myNewChannel',
]);
```

## `ALLOWED_ON_CHANNELS`

Currently only `'app:notification'` — for push events from main → renderer. The `on()` method returns a cleanup function; always call it in `onUnmounted()`.

## Build Note

Preload built with CJS output format to satisfy Electron's preload requirements:
```ts
// electron.vite.config.ts
preload: {
  build: {
    rollupOptions: {
      output: { format: 'cjs', entryFileNames: '[name].js' }
    }
  }
}
```
