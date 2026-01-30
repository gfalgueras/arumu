<script setup lang="ts">
import { ref, watch, shallowRef } from 'vue';
import { Loader2, Key, List, Link, Columns, Copy, Check } from 'lucide-vue-next';
import type { ColumnInfo, TableIndex, ForeignKey } from '@shared/types/database';

const props = defineProps<{
  serverName: string;
  database: string;
  table: string;
}>();

const columns = shallowRef<ColumnInfo[]>([]);
const indexes = shallowRef<TableIndex[]>([]);
const foreignKeys = shallowRef<ForeignKey[]>([]);
const createStatement = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const bottomTab = ref<'indexes' | 'fks'>('indexes');
const copied = ref(false);

const fetchSchemaData = async () => {
  loading.value = true;
  error.value = null;
  createStatement.value = null;
  try {
    const [colsRes, idxRes, fksRes, createRes] = await Promise.all([
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/schema`),
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/indexes`),
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/foreign-keys`),
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/create-statement`)
    ]);

    if (!colsRes.ok || !idxRes.ok || !fksRes.ok || !createRes.ok) {
      throw new Error('Failed to fetch table structure');
    }

    const [colsData, idxData, fksData, createData] = await Promise.all([
      colsRes.json(),
      idxRes.json(),
      fksRes.json(),
      createRes.json()
    ]);

    columns.value = colsData;
    indexes.value = idxData;
    foreignKeys.value = fksData;
    createStatement.value = createData.statement;
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};

const handleCopyCreate = async () => {
  if (!createStatement.value) return;
  
  try {
    await navigator.clipboard.writeText(createStatement.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

watch(() => [props.serverName, props.database, props.table], () => {
  fetchSchemaData();
}, { immediate: true });
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 w-full gap-4 overflow-hidden">
    <div v-if="loading && columns.length === 0" class="flex-1 flex items-center justify-center bg-slate-900 rounded-lg border border-slate-800">
      <Loader2 class="animate-spin text-blue-500" :size="48" />
    </div>

    <div v-else-if="error" class="flex-1 flex items-center justify-center text-red-400 bg-slate-900 rounded-lg border border-slate-800 p-8">
      <div class="text-center">
        <p class="text-xl font-bold mb-2">Error</p>
        <p>{{ error }}</p>
      </div>
    </div>

    <template v-else>
      <!-- Top Block: Columns (Larger) -->
      <div class="flex-[3] flex flex-col min-h-0 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
        <div class="px-4 py-2 border-b border-slate-800 bg-slate-800/50 flex items-center justify-between">
           <div class="flex items-center gap-2">
             <Columns :size="16" class="text-blue-400" />
             <span class="text-sm font-semibold text-slate-300">Columns</span>
           </div>
           <button 
             v-if="createStatement"
             @click="handleCopyCreate"
             class="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium transition-colors rounded"
             :class="copied ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700'"
             title="Copy CREATE TABLE"
           >
             <Check v-if="copied" :size="14" />
             <Copy v-else :size="14" />
             {{ copied ? 'Copied!' : 'Copy CREATE' }}
           </button>
        </div>
        <div class="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          <table class="w-full text-left border-collapse table-auto">
            <thead class="sticky top-0 z-10 bg-slate-800 shadow-sm">
              <tr>
                <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Name</th>
                <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Type</th>
                <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700 text-center">Nullable</th>
                <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700 text-center">Key</th>
                <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Default</th>
                <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Collation</th>
                <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Expression</th>
                <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Virtuality</th>
                <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Extra</th>
                <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Comment</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="col in columns" :key="col.name" class="hover:bg-slate-800/40 border-b border-slate-800/50 last:border-0 transition-colors">
                <td class="px-4 py-2 text-sm font-medium text-slate-100 flex items-center gap-2">
                  <Key v-if="col.key === 'PRI'" :size="12" class="text-yellow-500" title="Primary Key" />
                  <Key v-else-if="col.key" :size="12" class="text-slate-500" :title="col.key === 'UNI' ? 'Unique Key' : col.key === 'MUL' ? 'Multiple Key (Index)' : 'Index'" />
                  {{ col.name }}
                </td>
                <td class="px-4 py-2 text-sm font-mono text-blue-400">{{ col.type }}</td>
                <td class="px-4 py-2 text-sm text-center">
                  <span v-if="col.nullable" class="text-emerald-500 text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10">YES</span>
                  <span v-else class="text-slate-500 text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-500/10">NO</span>
                </td>
                <td class="px-4 py-2 text-sm text-center font-mono text-xs">
                  <span 
                    v-if="col.key" 
                    class="bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 cursor-help"
                    :title="col.key === 'PRI' ? 'Primary Key' : col.key === 'UNI' ? 'Unique Key' : col.key === 'MUL' ? 'Multiple Key (Index)' : col.key"
                  >
                    {{ col.key }}
                  </span>
                </td>
                <td class="px-4 py-2 text-sm text-slate-400 font-mono italic">
                  {{ col.default === null ? 'NULL' : col.default }}
                </td>
                <td class="px-4 py-2 text-sm text-slate-500 font-mono text-xs">
                  {{ col.collation }}
                </td>
                <td class="px-4 py-2 text-sm text-slate-500 font-mono text-xs max-w-xs truncate" :title="col.expression">
                  {{ col.expression }}
                </td>
                <td class="px-4 py-2 text-sm text-center">
                  <span v-if="col.virtuality" class="text-purple-400 text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-400/10 border border-purple-400/20">
                    {{ col.virtuality }}
                  </span>
                </td>
                <td class="px-4 py-2 text-sm text-slate-500 font-mono text-xs">
                  {{ col.extra }}
                </td>
                <td class="px-4 py-2 text-sm text-slate-400 italic text-xs max-w-sm truncate" :title="col.comment">
                  {{ col.comment }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Bottom Block: Tabs (Indexes, FKs) -->
      <div class="flex-[2] flex flex-col min-h-0 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
        <!-- Tabs Header -->
        <div class="flex border-b border-slate-800 flex-shrink-0 bg-slate-800/50">
          <button 
            @click="bottomTab = 'indexes'"
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2"
            :class="bottomTab === 'indexes' ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'"
          >
            <List :size="14" />
            Indices
          </button>
          <button 
            @click="bottomTab = 'fks'"
            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2"
            :class="bottomTab === 'fks' ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'"
          >
            <Link :size="14" />
            Foreign Keys
          </button>
        </div>

        <!-- Tab Content -->
        <div class="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          <div v-if="bottomTab === 'indexes'">
            <table class="w-full text-left border-collapse table-auto">
              <thead class="sticky top-0 z-10 bg-slate-800 shadow-sm">
                <tr>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Name</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Columns</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700 text-center">Unique</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Type</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="idx in indexes" :key="idx.name" class="hover:bg-slate-800/40 border-b border-slate-800/50 last:border-0 transition-colors">
                  <td class="px-4 py-2 text-sm font-medium text-slate-100">{{ idx.name }}</td>
                  <td class="px-4 py-2 text-sm text-blue-400 font-mono">{{ idx.columns.join(', ') }}</td>
                  <td class="px-4 py-2 text-sm text-center">
                    <span v-if="idx.unique" class="text-emerald-500 text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10">YES</span>
                    <span v-else class="text-slate-500 text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-500/10">NO</span>
                  </td>
                  <td class="px-4 py-2 text-sm text-slate-400 font-mono text-xs">{{ idx.type }}</td>
                </tr>
                <tr v-if="indexes.length === 0">
                  <td colspan="4" class="px-4 py-8 text-center text-slate-500 italic text-sm">No indexes found</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else-if="bottomTab === 'fks'">
            <table class="w-full text-left border-collapse table-auto">
              <thead class="sticky top-0 z-10 bg-slate-800 shadow-sm">
                <tr>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Name</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Columns</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Ref Table</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Ref Columns</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Rules (U/D)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="fk in foreignKeys" :key="fk.name" class="hover:bg-slate-800/40 border-b border-slate-800/50 last:border-0 transition-colors">
                  <td class="px-4 py-2 text-sm font-medium text-slate-100">{{ fk.name }}</td>
                  <td class="px-4 py-2 text-sm text-blue-400 font-mono">{{ fk.columns.join(', ') }}</td>
                  <td class="px-4 py-2 text-sm text-emerald-400">{{ fk.referencedTable }}</td>
                  <td class="px-4 py-2 text-sm text-blue-400 font-mono">{{ fk.referencedColumns.join(', ') }}</td>
                  <td class="px-4 py-2 text-sm text-slate-400 font-mono text-[10px]">
                    {{ fk.updateRule }} / {{ fk.deleteRule }}
                  </td>
                </tr>
                <tr v-if="foreignKeys.length === 0">
                  <td colspan="5" class="px-4 py-8 text-center text-slate-500 italic text-sm">No foreign keys found</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
