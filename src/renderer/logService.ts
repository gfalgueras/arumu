import { reactive } from 'vue';

export type LogLevel = 'info' | 'error' | 'warn' | 'success';
export type QueryType = 'select' | 'update' | 'delete' | 'insert' | 'other';

export interface LogEntry {
  id: string;
  ts: Date;
  level: LogLevel;
  queryType?: QueryType;
  message: string;
  detail?: string;
}

export const logEntries = reactive<LogEntry[]>([]);

function detectQueryType(sql: string): QueryType {
  const first = sql.trimStart().slice(0, 7).toUpperCase();
  if (first.startsWith('SELECT') || first.startsWith('SHOW') || first.startsWith('EXPLAIN')) return 'select';
  if (first.startsWith('UPDATE')) return 'update';
  if (first.startsWith('DELETE')) return 'delete';
  if (first.startsWith('INSERT')) return 'insert';
  return 'other';
}

export function addLog(level: LogLevel, message: string, detail?: string, queryType?: QueryType) {
  logEntries.push({
    id: `${Date.now()}_${Math.random()}`,
    ts: new Date(),
    level,
    queryType,
    message,
    detail,
  });
  if (logEntries.length > 1000) logEntries.splice(0, logEntries.length - 1000);
}

export function clearLogs() {
  logEntries.splice(0, logEntries.length);
}

const electronAPI = (window as any).electronAPI;
if (electronAPI) {
  electronAPI.on('query:log', ({ sql, durationMs, error }: { sql: string; durationMs: number; error?: string }) => {
    const shortSql = sql.length > 200 ? sql.slice(0, 200) + '…' : sql;
    const queryType = detectQueryType(sql);
    if (error) {
      addLog('error', shortSql, `${error} · ${durationMs}ms`, queryType);
    } else {
      addLog('info', shortSql, `${durationMs}ms`, queryType);
    }
  });
}
