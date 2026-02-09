<script setup lang="ts">
import { ref, computed, watch, onUnmounted, shallowRef } from 'vue';
import { Play, Loader2, AlertCircle, Database as DatabaseIcon, GripHorizontal } from 'lucide-vue-next';
import CodeMirror from 'vue-codemirror6';
import { sql, MySQL, PostgreSQL, SQLite, SQLDialect } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { $t } from '../i18n';
import { api } from '../services/api';

const props = defineProps<{
  serverName: string;
  serverType: 'mysql' | 'postgres' | 'sqlite';
  database: string | null;
}>();

const query = defineModel<string>({ default: '' });
const height = defineModel<number>('height', { default: 300 });
const loading = ref(false);
const fetchingSchema = ref(false);
const result = shallowRef<any>(null);
const error = ref<string | null>(null);
const schema = shallowRef<Record<string, string[]>>({});
const isResizing = ref(false);
const editorContainerRef = ref<HTMLElement | null>(null);

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
    autocompletion({ activateOnTyping: true }),
    keymap.of([
      ...completionKeymap,
      {
        key: "Ctrl-Enter",
        run: () => {
          handleExecute();
          return true;
        }
      }
    ])
  ];
});

const handleExecute = async () => {
  if (!props.serverName || loading.value) return;
  loading.value = true;
  error.value = null;
  result.value = null;

  try {
    const data = await api.executeSql(props.serverName, query.value, props.database || '');
    result.value = data;
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};

const formatCellValue = (val: any) => {
  if (val === null) return 'NULL';
  
  // Detect ISO date strings and format them
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
    return val.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');
  }
  
  return String(val);
};

const isArray = (val: any) => Array.isArray(val);
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
        @click="handleExecute"
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
        <div v-if="error" class="p-4 flex items-start gap-3 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-400/10">
          <AlertCircle :size="20" class="flex-shrink-0 mt-0.5" />
          <div class="space-y-1">
            <p class="font-bold">{{ $t('query_editor.query_error') }}</p>
            <p class="text-sm font-mono whitespace-pre-wrap">{{ error }}</p>
          </div>
        </div>

        <template v-if="result">
          <div class="flex-1 flex flex-col min-h-0">
            <div v-if="isArray(result)" class="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
              <table v-if="result.length > 0" class="w-full text-left border-collapse min-w-max">
                <thead class="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 shadow-sm">
                  <tr>
                    <th v-for="col in Object.keys(result[0])" :key="col" class="px-4 py-2 border-b border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {{ col }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50 dark:divide-slate-800/50">
                  <tr v-for="(row, i) in result" :key="i" class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td v-for="col in Object.keys(row)" :key="col" class="px-4 py-1.5 text-sm text-slate-600 dark:text-slate-300 truncate max-w-xs border-r border-slate-100 dark:border-slate-800/30 last:border-r-0">
                      <span v-if="row[col] === null" class="text-slate-400 dark:text-slate-600 italic text-xs">NULL</span>
                      <template v-else>{{ formatCellValue(row[col]) }}</template>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-else class="p-8 text-center text-slate-500 italic">{{ $t('query_editor.no_results') }}</div>
            </div>
            <div v-else class="p-4 overflow-auto font-mono text-sm text-blue-600 dark:text-blue-300 bg-slate-50 dark:bg-slate-950/50">
              <pre>{{ JSON.stringify(result, null, 2) }}</pre>
            </div>
          </div>
        </template>

        <div v-if="!result && !error && !loading" class="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-600 italic text-sm">
          {{ $t('query_editor.results_hint') }}
        </div>

        <div v-if="loading" class="flex-1 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
          <Loader2 class="animate-spin text-blue-600 dark:text-blue-500" :size="32" />
          <span>{{ $t('query_editor.executing') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
