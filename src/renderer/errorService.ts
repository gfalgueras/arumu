import { addLog } from './logService';

export function showError(title: string, message: string = '') {
  addLog('error', title, message || undefined);
}

export function hideError() {
  // no-op: kept for backward compat
}
