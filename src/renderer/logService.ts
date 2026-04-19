import { reactive } from 'vue';

export type LogLevel = 'info' | 'error' | 'warn' | 'success';

export interface LogEntry {
  id: string;
  ts: Date;
  level: LogLevel;
  message: string;
  detail?: string;
}

export const logEntries = reactive<LogEntry[]>([]);

export function addLog(level: LogLevel, message: string, detail?: string) {
  logEntries.push({
    id: `${Date.now()}_${Math.random()}`,
    ts: new Date(),
    level,
    message,
    detail,
  });
  if (logEntries.length > 1000) logEntries.splice(0, logEntries.length - 1000);
}

export function clearLogs() {
  logEntries.splice(0, logEntries.length);
}

// Listen for query log events pushed from the main process
const electronAPI = (window as any).electronAPI;
if (electronAPI) {
  electronAPI.on('query:log', ({ sql, durationMs, error }: { sql: string; durationMs: number; error?: string }) => {
    const shortSql = sql.length > 200 ? sql.slice(0, 200) + '…' : sql;
    if (error) {
      addLog('error', shortSql, `${error} · ${durationMs}ms`);
    } else {
      addLog('info', shortSql, `${durationMs}ms`);
    }
  });
}
