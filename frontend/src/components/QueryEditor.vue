<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Play, Loader2, AlertCircle, Database as DatabaseIcon } from 'lucide-vue-next';
import CodeMirror from 'vue-codemirror6';
import { sql, MySQL, PostgreSQL, SQLite } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';

const props = defineProps<{
  serverId: string;
  serverType: 'mysql' | 'postgres' | 'sqlite';
  database: string | null;
}>();

const query = defineModel<string>({ default: '' });
const loading = ref(false);
const fetchingSchema = ref(false);
const result = ref<any>(null);
const error = ref<string | null>(null);
const schema = ref<Record<string, string[]>>({});

watch(() => [props.serverId, props.database], async () => {
  if (props.serverId && props.database) {
    fetchingSchema.value = true;
    try {
      const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverId)}/databases/${encodeURIComponent(props.database)}/schema`);
      if (res.ok) {
        schema.value = await res.json();
      }
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
  const dialect = props.serverType === 'postgres' ? PostgreSQL : 
                  props.serverType === 'sqlite' ? SQLite : MySQL;
  
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
  if (!props.serverId || loading.value) return;
  loading.value = true;
  error.value = null;
  result.value = null;

  try {
    const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverId)}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        sql: query.value,
        database: props.database || undefined 
      }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to execute query');
    }

    const data = await res.json();
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

<template>
  <div class="flex-1 flex flex-col min-h-0 w-full gap-4">
    <!-- Toolbar -->
    <div class="flex items-center gap-4 bg-slate-900/50 p-2 border border-slate-700 rounded-lg">
      <button
        @click="handleExecute"
        :disabled="loading || !serverId"
        class="flex items-center gap-2 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white rounded font-medium text-sm"
      >
        <Loader2 v-if="loading" :size="16" class="animate-spin" />
        <Play v-else :size="16" />
        <span>Execute</span>
      </button>
      <div class="flex items-center gap-2 text-slate-400 text-sm border-l border-slate-700 pl-4">
        <DatabaseIcon :size="14" />
        <span>{{ database || 'No database selected' }}</span>
        <Loader2 v-if="fetchingSchema" :size="12" class="animate-spin ml-2 text-blue-500" />
        <span v-else-if="Object.keys(schema).length > 0" class="ml-2 text-[10px] bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-500 font-mono">
          {{ Object.keys(schema).length }} tables
        </span>
      </div>
    </div>

    <!-- Editor Area -->
    <div class="flex-1 flex flex-col min-h-0 gap-4">
      <div class="flex-1 h-1/2 min-h-[150px] overflow-hidden border border-slate-700 rounded-lg bg-[#282c34]">
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
          class="h-full text-sm font-mono"
        />
      </div>

      <!-- Results Area -->
      <div class="flex-1 h-1/2 min-h-0 flex flex-col border border-slate-700 rounded-lg bg-slate-900 overflow-hidden">
        <div v-if="error" class="p-4 flex items-start gap-3 text-red-400 bg-red-400/10">
          <AlertCircle :size="20" class="flex-shrink-0 mt-0.5" />
          <div class="space-y-1">
            <p class="font-bold">Query Error</p>
            <p class="text-sm font-mono whitespace-pre-wrap">{{ error }}</p>
          </div>
        </div>

        <template v-if="result">
          <div class="flex-1 flex flex-col min-h-0">
            <div v-if="isArray(result)" class="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              <table v-if="result.length > 0" class="w-full text-left border-collapse min-w-max">
                <thead class="sticky top-0 z-20 bg-slate-800 shadow-sm">
                  <tr>
                    <th v-for="col in Object.keys(result[0])" :key="col" class="px-4 py-2 border-b border-slate-700 text-sm font-semibold text-slate-200">
                      {{ col }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in result" :key="i" class="hover:bg-slate-800/40 border-b border-slate-800/50 last:border-0">
                    <td v-for="col in Object.keys(row)" :key="col" class="px-4 py-1.5 text-sm text-slate-300 truncate max-w-xs border-r border-slate-800/30 last:border-r-0">
                      <span v-if="row[col] === null" class="text-slate-600 italic text-xs">NULL</span>
                      <template v-else>{{ formatCellValue(row[col]) }}</template>
                    </td>
                  </tr>
                </tbody>
              </table>
              <div v-else class="p-8 text-center text-slate-500 italic">Query returned no results.</div>
            </div>
            <div v-else class="p-4 overflow-auto font-mono text-sm text-blue-300">
              <pre>{{ JSON.stringify(result, null, 2) }}</pre>
            </div>
          </div>
        </template>

        <div v-if="!result && !error && !loading" class="flex-1 flex items-center justify-center text-slate-600 italic text-sm">
          Execute a query to see results here
        </div>

        <div v-if="loading" class="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
          <Loader2 class="animate-spin text-blue-500" :size="32" />
          <span>Executing query...</span>
        </div>
      </div>
    </div>
  </div>
</template>
