import { createApp } from 'vue'
import './index.css'
import App from './App.vue'

const logError = (message: string, stack?: string) => {
  (window as any).electronAPI?.invoke('log:error', message, stack).catch(() => {});
};

window.onerror = (_event, _source, _line, _col, error) => {
  logError(error?.message ?? String(_event), error?.stack);
  return false;
};

window.addEventListener('unhandledrejection', (event) => {
  const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
  logError(err.message, err.stack);
});

createApp(App).mount('#root')
