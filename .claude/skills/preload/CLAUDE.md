# Preload Script (`src/preload/index.ts`)

The preload script **bridges the renderer and main process** securely via Electron's `contextBridge`.

---

## What it exposes

```ts
window.electronAPI = {
  invoke(channel: string, ...args: any[]): Promise<any>,
  on(channel: string, callback: (...args: any[]) => void): () => void,
}
```

## Security model
- Only channels listed in `ALLOWED_INVOKE_CHANNELS` can be called.
- Only channels listed in `ALLOWED_ON_CHANNELS` can be subscribed to.
- Calling any other channel throws immediately in the renderer.

## When to edit this file

**Always update this file when adding a new IPC channel.** Adding to `main/index.ts` alone is not enough — the channel must appear in `ALLOWED_INVOKE_CHANNELS` or the renderer will throw `"IPC channel not allowed: api:myNewChannel"`.

```ts
// Add to the Set:
const ALLOWED_INVOKE_CHANNELS = new Set([
  // ... existing channels ...
  'api:myNewChannel',
]);
```

## `ALLOWED_ON_CHANNELS`
Currently contains only `'app:notification'`. Used for push events from main → renderer. The `on()` method returns a cleanup function (removes the listener) — always call it in `onUnmounted()`.

## Build note
The preload is built with CJS output format (`format: 'cjs'`) to satisfy Electron's preload requirements:
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
