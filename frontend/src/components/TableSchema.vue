<script setup lang="ts">
import { ref, watch, shallowRef, computed, onUnmounted } from 'vue';
import { Loader2, Key, List, Link, Columns, Copy, Check, Plus, X, GripHorizontal } from 'lucide-vue-next';
import type { ColumnInfo, TableIndex, ForeignKey } from '@shared/types/database';
import MultiSelect from './MultiSelect.vue';
import { showError } from '../errorService';

const props = defineProps<{
  serverName: string;
  database: string;
  table: string;
}>();

const height = defineModel<number>('height', { default: 400 });

const columns = shallowRef<ColumnInfo[]>([]);
const indexes = shallowRef<TableIndex[]>([]);
const foreignKeys = shallowRef<ForeignKey[]>([]);
const createStatement = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const bottomTab = ref<'indexes' | 'fks'>('indexes');
const copied = ref(false);

const showAddIndex = ref(false);
const showAddFK = ref(false);
const saving = ref(false);
const isResizing = ref(false);
const containerRef = ref<HTMLElement | null>(null);

const startResizing = (e: MouseEvent) => {
  e.preventDefault();
  isResizing.value = true;
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isResizing.value || !containerRef.value) return;
  
  const rect = containerRef.value.getBoundingClientRect();
  const newHeight = e.clientY - rect.top;
  
  // Limitar la altura mínima y máxima razonable
  if (newHeight > 150 && newHeight < window.innerHeight - 300) {
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

const newIndex = ref<TableIndex>({
  name: '',
  columns: [],
  unique: false,
  type: 'BTREE'
});

const newFK = ref<ForeignKey>({
  name: '',
  columns: [],
  referencedTable: '',
  referencedColumns: [],
  updateRule: 'CASCADE',
  deleteRule: 'RESTRICT'
});

const allDatabaseSchema = ref<Record<string, string[]>>({});

const availableTables = computed(() => Object.keys(allDatabaseSchema.value).sort());
const columnNames = computed(() => columns.value.map(c => c.name));
const getReferencedTableColumns = (tableName: string) => allDatabaseSchema.value[tableName] || [];

const fetchSchemaData = async () => {
  loading.value = true;
  error.value = null;
  createStatement.value = null;
  try {
    const [colsRes, idxRes, fksRes, createRes, schemaRes] = await Promise.all([
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/schema`),
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/indexes`),
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/foreign-keys`),
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/create-statement`),
      fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/schema`)
    ]);

    if (!colsRes.ok || !idxRes.ok || !fksRes.ok || !createRes.ok || !schemaRes.ok) {
      throw new Error('Failed to fetch table structure');
    }

    const [colsData, idxData, fksData, createData, schemaData] = await Promise.all([
      colsRes.json(),
      idxRes.json(),
      fksRes.json(),
      createRes.json(),
      schemaRes.json()
    ]);

    columns.value = colsData;
    indexes.value = idxData;
    foreignKeys.value = fksData;
    createStatement.value = createData.statement;
    allDatabaseSchema.value = schemaData;
  } catch (err: any) {
    error.value = err.message;
    showError('Error al cargar estructura de tabla', err.message);
  } finally {
    loading.value = false;
  }
};

const handleAddIndex = async () => {
  if (newIndex.value.columns.length === 0) return;
  saving.value = true;
  try {
    const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/indexes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newIndex.value)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(errData.error || 'Error al añadir índice');
    }
    showAddIndex.value = false;
    await fetchSchemaData();
  } catch (err: any) {
    showError('Error al añadir índice', err.message);
  } finally {
    saving.value = false;
  }
};

const handleAddFK = async () => {
  if (newFK.value.columns.length === 0 || !newFK.value.referencedTable || newFK.value.referencedColumns.length === 0) return;
  saving.value = true;
  try {
    const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverName)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/foreign-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFK.value)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Error desconocido' }));
      throw new Error(errData.error || 'Error al añadir foreign key');
    }
    showAddFK.value = false;
    await fetchSchemaData();
  } catch (err: any) {
    showError('Error al añadir Foreign Key', err.message);
  } finally {
    saving.value = false;
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

watch(showAddIndex, (val) => {
  if (!val) {
    newIndex.value = { name: '', columns: [], unique: false, type: 'BTREE' };
  }
});

watch(showAddFK, (val) => {
  if (!val) {
    newFK.value = { name: '', columns: [], referencedTable: '', referencedColumns: [], updateRule: 'CASCADE', deleteRule: 'RESTRICT' };
  }
});

watch(() => [props.serverName, props.database, props.table], () => {
  showAddIndex.value = false;
  showAddFK.value = false;
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
      <div class="flex-1 flex flex-col min-h-0" ref="containerRef" :class="isResizing ? 'cursor-row-resize select-none' : ''">
        <!-- Top Block: Columns -->
        <div :style="{ height: height + 'px' }" class="flex-shrink-0 flex flex-col min-h-[150px] bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
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

        <!-- Resize Handle -->
        <div 
          class="h-3 flex items-center justify-center cursor-row-resize group"
          @mousedown="startResizing"
        >
          <div class="w-full h-px bg-slate-800 group-hover:bg-blue-500 transition-colors relative flex items-center justify-center">
            <div class="absolute bg-slate-900 border border-slate-700 rounded px-1 py-0.5 group-hover:border-blue-500 transition-colors">
              <GripHorizontal :size="12" class="text-slate-500 group-hover:text-blue-400" />
            </div>
          </div>
        </div>

        <!-- Bottom Block: Tabs (Indexes, FKs) -->
        <div class="flex-1 flex flex-col min-h-0 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
        <!-- Tabs Header -->
        <div class="flex border-b border-slate-800 flex-shrink-0 bg-slate-800/50 justify-between items-center pr-2">
          <div class="flex">
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
          <button 
            v-if="bottomTab === 'indexes'"
            @click="showAddIndex = !showAddIndex"
            class="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors"
            :class="showAddIndex ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10' : 'text-blue-400 hover:text-blue-300 hover:bg-blue-400/10'"
            :title="showAddIndex ? 'Cancel' : 'Añadir índice'"
          >
            <X v-if="showAddIndex" :size="14" />
            <Plus v-else :size="14" />
            {{ showAddIndex ? 'Cancel' : 'Add' }}
          </button>
          <button 
            v-else-if="bottomTab === 'fks'"
            @click="showAddFK = !showAddFK"
            class="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded transition-colors"
            :class="showAddFK ? 'text-red-400 hover:text-red-300 hover:bg-red-400/10' : 'text-blue-400 hover:text-blue-300 hover:bg-blue-400/10'"
            :title="showAddFK ? 'Cancelar' : 'Añadir foreign key'"
          >
            <X v-if="showAddFK" :size="14" />
            <Plus v-else :size="14" />
            {{ showAddFK ? 'Cancelar' : 'Add' }}
          </button>
        </div>

        <!-- Tab Content -->
        <div class="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
          <div v-if="bottomTab === 'indexes'">
            <!-- Add Index Form -->
            <div v-if="showAddIndex" class="p-4 bg-slate-800/30 border-b border-slate-800">
              <div class="flex flex-wrap gap-4 items-end">
                <div class="flex-1 min-w-[200px]">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Nombre del índice</label>
                  <input v-model="newIndex.name" type="text" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none" placeholder="Opcional" />
                </div>
                <div class="flex-[2] min-w-[300px]">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Columnas</label>
                  <MultiSelect v-model="newIndex.columns" :options="columnNames" placeholder="Selecciona columnas..." />
                </div>
                <div class="flex items-center h-[38px] mb-0.5">
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" v-model="newIndex.unique" class="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900" />
                    <span class="text-xs font-semibold text-slate-400 uppercase">Unique</span>
                  </label>
                </div>
                <div class="ml-auto mb-1">
                  <button 
                    @click="handleAddIndex" 
                    :disabled="saving || newIndex.columns.length === 0"
                    class="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
                  >
                    <Loader2 v-if="saving" :size="14" class="animate-spin" />
                    Guardar
                  </button>
                </div>
              </div>
            </div>

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
            <!-- Add FK Form -->
            <div v-if="showAddFK" class="p-4 bg-slate-800/30 border-b border-slate-800 space-y-4">
              <!-- Row 1: Name, Update Rule, Delete Rule, Save Button -->
              <div class="flex flex-wrap gap-4 items-end">
                <div class="flex-1 min-w-[200px]">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Nombre FK</label>
                  <input v-model="newFK.name" type="text" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none" placeholder="Opcional" />
                </div>
                <div class="w-40">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Update Rule</label>
                  <select v-model="newFK.updateRule" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none">
                    <option value="CASCADE">CASCADE</option>
                    <option value="NO ACTION">NO ACTION</option>
                    <option value="RESTRICT">RESTRICT</option>
                    <option value="SET NULL">SET NULL</option>
                  </select>
                </div>
                <div class="w-40">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Delete Rule</label>
                  <select v-model="newFK.deleteRule" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none">
                    <option value="CASCADE">CASCADE</option>
                    <option value="NO ACTION">NO ACTION</option>
                    <option value="RESTRICT">RESTRICT</option>
                    <option value="SET NULL">SET NULL</option>
                  </select>
                </div>
                <div class="ml-auto">
                  <button 
                    @click="handleAddFK" 
                    :disabled="saving || newFK.columns.length === 0 || !newFK.referencedTable || newFK.referencedColumns.length === 0"
                    class="px-6 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors flex items-center gap-2"
                  >
                    <Loader2 v-if="saving" :size="14" class="animate-spin" />
                    Guardar FK
                  </button>
                </div>
              </div>

              <!-- Row 2: Local Columns, Ref Table, Ref Columns, Cancel Button -->
              <div class="flex flex-wrap gap-4 items-end">
                <div class="flex-1 min-w-[200px]">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Columnas locales</label>
                  <MultiSelect v-model="newFK.columns" :options="columnNames" placeholder="Selecciona columnas locales..." />
                </div>
                <div class="flex-1 min-w-[200px]">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Tabla referenciada</label>
                  <select v-model="newFK.referencedTable" class="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:border-blue-500 outline-none">
                    <option value="">Selecciona una tabla</option>
                    <option v-for="t in availableTables" :key="t" :value="t">{{ t }}</option>
                  </select>
                </div>
                <div class="flex-1 min-w-[200px]">
                  <label class="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Columnas referenciadas</label>
                  <MultiSelect 
                    v-model="newFK.referencedColumns" 
                    :options="getReferencedTableColumns(newFK.referencedTable)" 
                    :disabled="!newFK.referencedTable"
                    :placeholder="!newFK.referencedTable ? 'Selecciona una tabla primero' : 'Selecciona columnas referenciadas...'" 
                  />
                </div>
              </div>
            </div>

            <table class="w-full text-left border-collapse table-auto">
              <thead class="sticky top-0 z-10 bg-slate-800 shadow-sm">
                <tr>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Name</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Columns</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Ref Table</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Ref Columns</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Update Rule</th>
                  <th class="px-4 py-2 text-sm font-semibold text-slate-200 border-b border-slate-700">Delete Rule</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="fk in foreignKeys" :key="fk.name" class="hover:bg-slate-800/40 border-b border-slate-800/50 last:border-0 transition-colors">
                  <td class="px-4 py-2 text-sm font-medium text-slate-100">{{ fk.name }}</td>
                  <td class="px-4 py-2 text-sm text-blue-400 font-mono">{{ fk.columns.join(', ') }}</td>
                  <td class="px-4 py-2 text-sm text-emerald-400">{{ fk.referencedTable }}</td>
                  <td class="px-4 py-2 text-sm text-blue-400 font-mono">{{ fk.referencedColumns.join(', ') }}</td>
                  <td class="px-4 py-2 text-sm text-slate-400 font-mono text-[10px]">
                    {{ fk.updateRule }}
                  </td>
                  <td class="px-4 py-2 text-sm text-slate-400 font-mono text-[10px]">
                    {{ fk.deleteRule }}
                  </td>
                </tr>
                <tr v-if="foreignKeys.length === 0">
                  <td colspan="6" class="px-4 py-8 text-center text-slate-500 italic text-sm">No foreign keys found</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </div>
    </template>
  </div>
</template>
