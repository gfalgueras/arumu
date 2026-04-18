<script setup lang="ts">
import { ref, computed, watch, onUnmounted, shallowRef, type ComponentPublicInstance } from 'vue';
import { Play, Loader2, AlertCircle, Database as DatabaseIcon, GripHorizontal } from 'lucide-vue-next';
import CodeMirror from 'vue-codemirror6';
import { sql, MySQL, PostgreSQL, SQLite, SQLDialect } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap, EditorView } from '@codemirror/view';
import { autocompletion, completionKeymap, acceptCompletion } from '@codemirror/autocomplete';
import { $t } from '../i18n';
import { api } from '../services/api';
import { hotkeys, toCodeMirrorKey } from '../hotkeys';

const props = defineProps<{
  serverName: string;
  serverType: 'mysql' | 'postgres' | 'sqlite';
  database: string | null;
}>();

const query = defineModel<string>({ default: '' });
const height = defineModel<number>('height', { default: 300 });
interface ResultTab {
  id: number;
  sql: string;
  result: any;
  error: string | null;
  duration: number;
}

const loading = ref(false);
const fetchingSchema = ref(false);
const resultTabs = ref<ResultTab[]>([]);
const activeResultTab = ref(0);
const schema = shallowRef<Record<string, string[]>>({});
const isResizing = ref(false);
const editorContainerRef = ref<HTMLElement | null>(null);
const cmRef = ref<ComponentPublicInstance & { view?: EditorView } | null>(null);

const startResizing = (e: MouseEvent) => {
  e.preventDefault();
  isResizing.value = true;
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isResizing.value || !editorContainerRef.value) return;
  
  const rect = editorContainerRef.value.getBoundingClientRect();
  const newHeight = e.clientY - rect.top;
  
  // Limitar la altura mínima y máxima razonable
  if (newHeight > 100 && newHeight < window.innerHeight - 200) {
    height.value = newHeight;
  }
};

const handleMouseUp = () => {
  isResizing.value = false;
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
};

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
});

watch(() => [props.serverName, props.database], async () => {
  if (props.serverName && props.database) {
    fetchingSchema.value = true;
    try {
      const data = await api.getSchema(props.serverName, props.database);
      schema.value = data;
    } catch (err) {
      console.error('Error fetching schema:', err);
    } finally {
      fetchingSchema.value = false;
    }
  } else {
    schema.value = {};
  }
}, { immediate: true });

const extensions = computed(() => {
  const baseDialect = props.serverType === 'postgres' ? PostgreSQL : 
                      props.serverType === 'sqlite' ? SQLite : MySQL;
  const dialect = SQLDialect.define({
    ...baseDialect.spec,
    caseInsensitiveIdentifiers: true,
  });
  
  return [
    sql({ 
      dialect, 
      schema: schema.value,
      upperCaseKeywords: true
    }),
    oneDark,
    EditorView.theme({
      '&': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' },
      '.cm-content': { fontFamily: 'inherit' },
    }),
    autocompletion({ activateOnTyping: true }),
    keymap.of([
      { key: "Tab", run: acceptCompletion },
      ...completionKeymap,
      {
        key: toCodeMirrorKey(hotkeys.executeAll),
        run: (view) => {
          const sel = view.state.selection.main;
          const text = sel.empty
            ? view.state.doc.toString().trim()
            : view.state.sliceDoc(sel.from, sel.to).trim();
          handleExecute(text, true);
          return true;
        }
      },
      {
        key: toCodeMirrorKey(hotkeys.executeStatement),
        run: (view) => { handleExecute(getStatementAtCursor(view), false); return true; }
      }
    ])
  ];
});

const getStatementAtCursor = (view: EditorView): string => {
  const text = view.state.doc.toString();
  const cursor = view.state.selection.main.head;
  let start = 0;
  let lastStmt = '';
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === ';') {
      if (cursor >= start && cursor <= i) {
        const beforeCursor = text.slice(start, cursor);
        if (beforeCursor.trim() === '' && lastStmt) return lastStmt;
        const stmt = text.slice(start, i).trim();
        return stmt || lastStmt;
      }
      const s = text.slice(start, i).trim();
      if (s) lastStmt = s;
      start = i + 1;
    }
  }
  return text.trim();
};

const getSelectionOrAll = (view: EditorView): string => {
  const sel = view.state.selection.main;
  if (!sel.empty) return view.state.sliceDoc(sel.from, sel.to).trim();
  return view.state.doc.toString().trim();
};

const splitStatements = (rawSql: string): string[] => {
  const stmts: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < rawSql.length; i++) {
    const ch = rawSql[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; }
    else if (ch === '"' && !inSingle) { inDouble = !inDouble; }
    else if (ch === ';' && !inSingle && !inDouble) {
      const s = current.trim();
      if (s) stmts.push(s);
      current = '';
      continue;
    }
    current += ch;
  }
  const s = current.trim();
  if (s) stmts.push(s);
  return stmts.length ? stmts : [rawSql.trim()];
};

const handleExecute = async (rawSql: string, split = true) => {
  if (!props.serverName || loading.value || !rawSql.trim()) return;
  loading.value = true;
  resultTabs.value = [];
  activeResultTab.value = 0;

  const stmts = split ? splitStatements(rawSql) : [rawSql.trim()];
  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const t0 = Date.now();
    try {
      const data = await api.executeSql(props.serverName, stmt, props.database || '');
      resultTabs.value.push({ id: i, sql: stmt, result: data, error: null, duration: Date.now() - t0 });
    } catch (err: any) {
      const raw: string = err.message || String(err);
      const msg = raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
      resultTabs.value.push({ id: i, sql: stmt, result: null, error: msg, duration: Date.now() - t0 });
    }
  }

  loading.value = false;
};

const tabLabel = (tab: ResultTab): string => {
  if (tab.error) return `Error ${tab.id + 1}`;
  if (Array.isArray(tab.result)) return `Result ${tab.id + 1} (${tab.result.length} rows)`;
  if (tab.result?.affectedRows !== undefined) return `Result ${tab.id + 1} (${tab.result.affectedRows} affected)`;
  return `Result ${tab.id + 1}`;
};

const handleExecuteFromButton = () => {
  const v = cmRef.value?.view;
  if (!v) { handleExecute(query.value, true); return; }
  const sel = v.state.selection.main;
  const text = sel.empty
    ? v.state.doc.toString().trim()
    : v.state.sliceDoc(sel.from, sel.to).trim();
  handleExecute(text, true);
};

const formatCellValue = (val: any) => {
  if (val === null) return 'NULL';
  
  // Detect ISO date strings and format them
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
    return val.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');
  }
  
  return String(val);
};

</script>

<style scoped>
:deep(.cm-editor) {
  height: 100%;
}
</style>

<template>
  <div class="flex-1 flex flex-col min-h-0 w-full gap-4">
    <!-- Toolbar -->
    <div class="flex items-center gap-4 bg-white dark:bg-slate-900/50 p-2 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
      <button
        @click="handleExecuteFromButton"
        :disabled="loading || !serverName"
        class="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded font-medium text-sm transition-colors shadow-sm"
      >
        <Loader2 v-if="loading" :size="16" class="animate-spin" />
        <Play v-else :size="16" />
        <span>{{ $t('query_editor.execute') }}</span>
      </button>
      <div class="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-sm border-l border-slate-200 dark:border-slate-700 pl-4">
        <DatabaseIcon :size="14" />
        <span>{{ database || $t('query_editor.no_db') }}</span>
        <Loader2 v-if="fetchingSchema" :size="12" class="animate-spin ml-2 text-blue-500" />
        <span v-else-if="Object.keys(schema).length > 0" class="ml-2 text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 font-mono">
          {{ Object.keys(schema).length }} {{ $t('query_editor.tables_count') }}
        </span>
      </div>
    </div>

    <!-- Editor Area -->
    <div 
      class="flex-1 flex flex-col min-h-0"
      ref="editorContainerRef"
      :class="isResizing ? 'cursor-row-resize select-none' : ''"
    >
      <div 
        :style="{ height: height + 'px' }"
        class="min-h-[150px] overflow-hidden border border-slate-200 dark:border-slate-700 rounded-lg bg-[#282c34] flex flex-col flex-shrink-0 shadow-sm"
      >
        <CodeMirror
          ref="cmRef"
          v-model="query"
          :extensions="extensions"
          :basic-setup="{ 
            lineNumbers: true,
            foldGutter: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            bracketMatching: true,
            autocompletion: false,
            highlightActiveLine: true,
            highlightSelectionMatches: true
          }"
          class="flex-1 h-full text-sm font-mono"
        />
      </div>

      <!-- Resize Handle -->
      <div 
        class="h-3 flex items-center justify-center cursor-row-resize group"
        @mousedown="startResizing"
      >
        <div class="w-full h-px bg-slate-200 dark:bg-slate-800 group-hover:bg-blue-500 transition-colors relative flex items-center justify-center">
          <div class="absolute bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 group-hover:border-blue-500 transition-colors">
            <GripHorizontal :size="12" class="text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400" />
          </div>
        </div>
      </div>

      <!-- Results Area -->
      <div class="flex-1 min-h-0 flex flex-col border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 overflow-hidden shadow-sm">

        <!-- Loading -->
        <div v-if="loading" class="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 class="animate-spin text-blue-600 dark:text-blue-500" :size="32" />
          <span>{{ $t('query_editor.executing') }}</span>
        </div>

        <!-- Empty state -->
        <div v-else-if="resultTabs.length === 0" class="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-600 italic text-sm">
          {{ $t('query_editor.results_hint') }}
        </div>

        <!-- Result tabs -->
        <template v-else>
          <!-- Tabs header -->
          <div class="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex-shrink-0 overflow-x-auto scrollbar-none">
            <button
              v-for="tab in resultTabs"
              :key="tab.id"
              @click="activeResultTab = tab.id"
              class="px-3 py-1.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors flex items-center gap-1.5"
              :class="activeResultTab === tab.id
                ? (tab.error ? 'border-red-500 text-red-500 bg-red-500/5' : 'border-blue-500 text-blue-500 bg-blue-500/5')
                : (tab.error ? 'border-transparent text-red-400 hover:bg-red-400/5' : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50')"
            >
              <AlertCircle v-if="tab.error" :size="11" />
              {{ tabLabel(tab) }}
              <span class="text-[10px] opacity-50 font-normal">{{ tab.duration }}ms</span>
            </button>
          </div>

          <!-- Active tab content -->
          <template v-if="resultTabs[activeResultTab]">
            <div v-if="resultTabs[activeResultTab].error" class="p-4 flex items-start gap-3 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10 flex-shrink-0">
              <AlertCircle :size="20" class="flex-shrink-0 mt-0.5" />
              <div class="space-y-1">
                <p class="font-bold">{{ $t('query_editor.query_error') }}</p>
                <p class="text-sm font-mono whitespace-pre-wrap">{{ resultTabs[activeResultTab].error }}</p>
              </div>
            </div>
            <div v-else-if="Array.isArray(resultTabs[activeResultTab].result)" class="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
              <table v-if="resultTabs[activeResultTab].result.length > 0" class="w-full text-left border-collapse min-w-max">
                <thead class="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 shadow-sm">
                  <tr>
                    <th v-for="col in Object.keys(resultTabs[activeResultTab].result[0])" :key="col" class="px-4 py-2 border-b border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {{ col }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50 dark:divide-slate-800/50">
                  <tr v-for="(row, i) in resultTabs[activeResultTab].result" :key="i" class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td v-for="col in Object.keys(row)" :key="col" class="px-4 py-1.5 text-sm text-slate-600 dark:text-slate-300 truncate max-w-xs border-r border-slate-100 dark:border-slate-800/30 last:border-r-0">
                      <span v-if="row[col] === null" class="text-slate-400 dark:text-slate-600 italic text-xs">NULL</span>
                      <template v-else>{{ formatCellValue(row[col]) }}</template>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-else class="p-8 text-center text-slate-500 italic">{{ $t('query_editor.no_results') }}</div>
            </div>
            <div v-else class="p-4 overflow-auto font-mono text-sm text-blue-600 dark:text-blue-300 bg-slate-50 dark:bg-slate-950/50 flex-1">
              <pre>{{ JSON.stringify(resultTabs[activeResultTab].result, null, 2) }}</pre>
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>
