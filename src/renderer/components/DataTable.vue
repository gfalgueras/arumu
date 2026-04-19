<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, shallowRef } from 'vue';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUp, ArrowDown, Loader2, Download, ChevronDown, Plus, Check, X, Upload
} from 'lucide-vue-next';
import type { SortConfig, TableDataResponse, ColumnInfo } from '@shared/types/database';
import { showError } from '../errorService';
import { $t } from '../i18n';
import { api } from '../services/api';
import DataRow from './DataTable/DataRow.vue';
import FilterInput from './DataTable/FilterInput.vue';
import CsvImportModal from './CsvImportModal.vue';

const props = defineProps<{
  serverName: string;
  serverType: 'mysql' | 'postgres' | 'sqlite';
  database: string;
  table: string;
}>();

interface EditCell { value: string; isNull: boolean; }

const data = shallowRef<TableDataResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const page = ref(0);
const sort = ref<SortConfig[]>([]);
const appliedFilter = ref('');
const columnWidths = ref<Record<string, number>>({});
const resizingColumn = ref<{
  name: string;
  startX: number;
  startWidth: number;
  otherColumnsTotalWidth: number;
} | null>(null);

const tableRef = ref<HTMLTableElement | null>(null);
// Plain Map — no reactive overhead for DOM refs used only in mousemove handler
const colRefs = new Map<string, HTMLTableColElement>();
const limit = 1000;

// Row editing state
const columnInfo = ref<ColumnInfo[]>([]);
const editingRowIndex = ref<number | null>(null);
// shallowRef: we always reassign the whole object with spread, never mutate nested props
const editValues = shallowRef<Record<string, EditCell>>({});
const newRowMode = ref(false);
const newRowValues = shallowRef<Record<string, EditCell>>({});
const savingRow = ref(false);

// Export dropdown
const showExportMenu = ref(false);
const exportMenuRef = ref<HTMLElement | null>(null);

// Import modal
const showImportModal = ref(false);

const pkColumns = computed(() =>
  columnInfo.value.filter(c => c.key === 'PRI').map(c => c.name)
);
const canEdit = computed(() => pkColumns.value.length > 0);

// Precomputed sort map — avoids calling find()+indexOf() per column in template
const sortIconMap = computed(() => {
  const map: Record<string, { direction: 'ASC' | 'DESC'; index: number } | undefined> = {};
  for (let i = 0; i < sort.value.length; i++) {
    const s = sort.value[i];
    map[s.column] = { direction: s.direction, index: i + 1 };
  }
  return map;
});

watch(() => [props.serverName, props.database, props.table], async () => {
  page.value = 0;
  sort.value = [];
  appliedFilter.value = '';
  columnWidths.value = {};
  editingRowIndex.value = null;
  newRowMode.value = false;
  try {
    columnInfo.value = await api.getColumns(props.serverName, props.database, props.table);
  } catch {
    columnInfo.value = [];
  }
}, { immediate: true });

const fetchData = async () => {
  loading.value = true;
  error.value = null;
  try {
    const result = await api.getTableData(props.serverName, props.database, props.table, {
      limit,
      offset: page.value * limit,
      sort: sort.value,
      filter: appliedFilter.value
    });
    data.value = result;
  } catch (err: any) {
    error.value = err.message;
    showError($t('data_table.error_load'), err.message);
  } finally {
    loading.value = false;
  }
};

watch(() => [props.serverName, props.database, props.table, page.value, sort.value, appliedFilter.value], () => {
  fetchData();
}, { immediate: true });

const handleSort = (column: string) => {
  if (editingRowIndex.value !== null || newRowMode.value) return;
  const existing = sort.value.find(s => s.column === column);
  if (!existing) {
    sort.value = [...sort.value, { column, direction: 'DESC' }];
  } else if (existing.direction === 'DESC') {
    sort.value = sort.value.map(s => s.column === column ? { ...s, direction: 'ASC' } : s);
  } else {
    sort.value = sort.value.filter(s => s.column !== column);
  }
};

const handleApplyFilter = (val: string) => {
  page.value = 0;
  appliedFilter.value = val;
};

// Stable key for v-for rows — prevents full re-mount on sort/filter when PK exists
const getRowKey = (row: any, i: number): string | number => {
  if (pkColumns.value.length > 0) {
    return pkColumns.value.map(pk => row[pk]).join('§');
  }
  return i;
};

// Column resize — directly mutates DOM style during drag (no reactive updates until mouseup)
const handleMouseDown = (e: MouseEvent, column: string) => {
  const currentWidth = columnWidths.value[column] || 150;
  const otherColumnsTotalWidth = data.value?.columns.reduce((acc, col) => {
    if (col === column) return acc;
    return acc + (columnWidths.value[col] || 150);
  }, 0) || 0;
  resizingColumn.value = { name: column, startX: e.clientX, startWidth: currentWidth, otherColumnsTotalWidth };
};

const handleMouseMove = (e: MouseEvent) => {
  if (!resizingColumn.value) return;
  const diff = e.clientX - resizingColumn.value.startX;
  const newWidth = Math.max(50, resizingColumn.value.startWidth + diff);
  const colEl = colRefs.get(resizingColumn.value.name);
  if (colEl) colEl.style.width = `${newWidth}px`;
  if (tableRef.value) {
    const newTotalWidth = resizingColumn.value.otherColumnsTotalWidth + newWidth;
    tableRef.value.style.width = `${newTotalWidth}px`;
  }
};

const handleMouseUp = (e: MouseEvent) => {
  if (resizingColumn.value) {
    const diff = e.clientX - resizingColumn.value.startX;
    const newWidth = Math.max(50, resizingColumn.value.startWidth + diff);
    columnWidths.value = { ...columnWidths.value, [resizingColumn.value.name]: newWidth };
  }
  resizingColumn.value = null;
};

const handleClickOutside = (e: MouseEvent) => {
  if (exportMenuRef.value && !exportMenuRef.value.contains(e.target as Node)) {
    showExportMenu.value = false;
  }
};

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('mousedown', handleClickOutside);
});

const totalPages = computed(() => data.value ? Math.ceil(data.value.total / limit) : 0);
const totalWidth = computed(() => {
  const dataCols = data.value?.columns.reduce((acc, col) => acc + (columnWidths.value[col] || 150), 0) || 0;
  return dataCols + 70; // action column
});

// ---- Row Editing ----

const escId = (s: string) => '`' + s.replace(/`/g, '``') + '`';
const escVal = (val: string | null): string => {
  if (val === null) return 'NULL';
  const n = Number(val);
  if (!isNaN(n) && val.trim() !== '') return val;
  return "'" + val.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
};

const startEdit = (index: number) => {
  const row = data.value!.rows[index];
  const vals: Record<string, EditCell> = {};
  for (const col of data.value!.columns) {
    vals[col] = { value: row[col] === null ? '' : String(row[col]), isNull: row[col] === null };
  }
  editValues.value = vals;
  editingRowIndex.value = index;
  newRowMode.value = false;
};

const cancelEdit = () => {
  editingRowIndex.value = null;
  newRowMode.value = false;
  newRowValues.value = {};
};

const updateCell = (col: string, value: string, isNull: boolean) => {
  if (newRowMode.value) {
    newRowValues.value = { ...newRowValues.value, [col]: { value, isNull } };
  } else {
    editValues.value = { ...editValues.value, [col]: { value, isNull } };
  }
};

const saveEdit = async (index: number) => {
  if (!data.value || savingRow.value) return;
  savingRow.value = true;
  try {
    const setClauses = data.value.columns
      .map(col => `${escId(col)} = ${escVal(editValues.value[col]?.isNull ? null : editValues.value[col]?.value ?? '')}`)
      .join(', ');
    const whereClauses = pkColumns.value
      .map(pk => `${escId(pk)} = ${escVal(data.value!.rows[index][pk] === null ? null : String(data.value!.rows[index][pk]))}`)
      .join(' AND ');
    await api.executeSql(props.serverName, `UPDATE ${escId(props.table)} SET ${setClauses} WHERE ${whereClauses}`, props.database);
    editingRowIndex.value = null;
    await fetchData();
  } catch (err: any) {
    const msg = err.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || String(err);
    showError($t('data_table.error_update'), msg);
  } finally {
    savingRow.value = false;
  }
};

const deleteRow = async (index: number) => {
  if (!data.value || !confirm($t('data_table.confirm_delete'))) return;
  savingRow.value = true;
  try {
    const whereClauses = pkColumns.value
      .map(pk => `${escId(pk)} = ${escVal(data.value!.rows[index][pk] === null ? null : String(data.value!.rows[index][pk]))}`)
      .join(' AND ');
    await api.executeSql(props.serverName, `DELETE FROM ${escId(props.table)} WHERE ${whereClauses}`, props.database);
    await fetchData();
  } catch (err: any) {
    const msg = err.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || String(err);
    showError($t('data_table.error_delete'), msg);
  } finally {
    savingRow.value = false;
  }
};

const startNewRow = () => {
  if (!data.value) return;
  const vals: Record<string, EditCell> = {};
  for (const col of data.value.columns) {
    const ci = columnInfo.value.find(c => c.name === col);
    vals[col] = { value: ci?.default != null ? String(ci.default) : '', isNull: ci?.nullable ?? true };
  }
  newRowValues.value = vals;
  newRowMode.value = true;
  editingRowIndex.value = null;
};

const saveNewRow = async () => {
  if (!data.value || savingRow.value) return;
  savingRow.value = true;
  try {
    const cols = data.value.columns.map(escId).join(', ');
    const vals = data.value.columns
      .map(col => escVal(newRowValues.value[col]?.isNull ? null : newRowValues.value[col]?.value ?? ''))
      .join(', ');
    await api.executeSql(props.serverName, `INSERT INTO ${escId(props.table)} (${cols}) VALUES (${vals})`, props.database);
    newRowMode.value = false;
    newRowValues.value = {};
    await fetchData();
  } catch (err: any) {
    const msg = err.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || String(err);
    showError($t('data_table.error_insert'), msg);
  } finally {
    savingRow.value = false;
  }
};

// ---- Export ----

const csvEscape = (val: any): string => {
  if (val === null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};

const exportCurrentPage = async () => {
  showExportMenu.value = false;
  if (!data.value) return;
  const cols = data.value.columns;
  const header = cols.map(csvEscape).join(',');
  let content = header + '\n';
  for (const row of data.value.rows) {
    content += cols.map(col => csvEscape(row[col])).join(',') + '\n';
  }
  const result = await api.saveExportFile(
    `${props.table}.csv`,
    content,
    [{ name: 'CSV Files', extensions: ['csv'] }]
  );
  if (!result?.saved) return;
};

const exportAllCsv = async () => {
  showExportMenu.value = false;
  try {
    await api.exportTableData(props.serverName, props.database, props.table, 'csv', appliedFilter.value, sort.value);
  } catch (err: any) {
    showError($t('data_table.error_export'));
  }
};

const exportSql = async () => {
  showExportMenu.value = false;
  try {
    await api.exportTableData(props.serverName, props.database, props.table, 'sql', appliedFilter.value, sort.value);
  } catch (err: any) {
    showError($t('data_table.error_export'));
  }
};
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 w-full min-w-0 relative" :class="resizingColumn ? 'cursor-col-resize select-none' : ''">
    <div v-if="loading && !data" class="absolute inset-0 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-center z-10 rounded-lg">
      <Loader2 class="animate-spin text-blue-500" :size="48" />
    </div>

    <div v-if="error" class="flex-1 flex items-center justify-center text-red-600 dark:text-red-400 p-8">
      <div class="text-center">
        <p class="text-xl font-bold mb-2">Error</p>
        <p>{{ error }}</p>
      </div>
    </div>

    <template v-else>
      <!-- Toolbar -->
      <div class="flex items-center justify-between p-2 bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 rounded-t-lg min-h-[48px] gap-2">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <FilterInput
            :initialValue="appliedFilter"
            @apply="handleApplyFilter"
            :isLoading="loading"
            :serverType="serverType"
            :columns="data?.columns || []"
            :table="table"
          />
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <!-- Add row button -->
          <button
            v-if="canEdit && data"
            @click="newRowMode ? cancelEdit() : startNewRow()"
            :disabled="savingRow"
            :title="$t('data_table.add_row')"
            class="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors"
            :class="newRowMode
              ? 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400'
              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600'"
          >
            <X v-if="newRowMode" :size="13" />
            <Plus v-else :size="13" />
            <span>{{ newRowMode ? $t('data_table.cancel_edit') : $t('data_table.add_row') }}</span>
          </button>

          <!-- No PK warning -->
          <span v-else-if="data && !canEdit" class="text-xs text-amber-500 dark:text-amber-400 italic">
            {{ $t('data_table.no_primary_key') }}
          </span>

          <!-- Import button -->
          <button
            @click="showImportModal = true"
            class="flex items-center gap-1 px-2 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 rounded-lg transition-colors"
          >
            <Upload :size="13" />
            <span>{{ $t('import.import') }}</span>
          </button>

          <!-- Export dropdown -->
          <div class="relative" ref="exportMenuRef">
            <button
              @click="showExportMenu = !showExportMenu"
              :disabled="!data"
              class="flex items-center gap-1 px-2 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 rounded-lg transition-colors disabled:opacity-40"
            >
              <Download :size="13" />
              <span>{{ $t('data_table.export') }}</span>
              <ChevronDown :size="11" :class="showExportMenu ? 'rotate-180' : ''" class="transition-transform" />
            </button>
            <Transition
              enter-active-class="transition duration-100 ease-out"
              enter-from-class="opacity-0 scale-95 -translate-y-1"
              enter-to-class="opacity-100 scale-100 translate-y-0"
              leave-active-class="transition duration-75 ease-in"
              leave-from-class="opacity-100 scale-100 translate-y-0"
              leave-to-class="opacity-0 scale-95 -translate-y-1"
            >
              <div v-if="showExportMenu" class="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden w-56">
                <button @click="exportCurrentPage" class="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left">
                  <Check :size="12" class="text-blue-500 shrink-0" />
                  {{ $t('data_table.export_csv_page') }}
                </button>
                <button @click="exportAllCsv" class="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left">
                  <Download :size="12" class="text-blue-500 shrink-0" />
                  {{ $t('data_table.export_csv_all') }}
                </button>
                <button @click="exportSql" class="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left">
                  <Download :size="12" class="text-slate-500 shrink-0" />
                  {{ $t('data_table.export_sql') }}
                </button>
              </div>
            </Transition>
          </div>

          <!-- Pagination -->
          <div class="flex items-center gap-1 border-l border-slate-300 dark:border-slate-700 pl-2">
            <div class="text-xs text-slate-500 dark:text-slate-400 mr-2" v-if="data">
              {{ page * limit + 1 }}–{{ Math.min((page + 1) * limit, data.total) }} / {{ data.total }}
            </div>
            <button :disabled="page === 0 || loading" @click="page = 0" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 transition-colors"><ChevronsLeft :size="16" /></button>
            <button :disabled="page === 0 || loading" @click="page--" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 transition-colors"><ChevronLeft :size="16" /></button>
            <span class="text-xs px-1 text-slate-600 dark:text-slate-400 font-medium whitespace-nowrap">{{ $t('data_table.page') }} {{ page + 1 }} / {{ totalPages || 1 }}</span>
            <button :disabled="page >= totalPages - 1 || loading" @click="page++" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 transition-colors"><ChevronRight :size="16" /></button>
            <button :disabled="page >= totalPages - 1 || loading" @click="page = totalPages - 1" class="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded disabled:opacity-30 transition-colors"><ChevronsRight :size="16" /></button>
          </div>
        </div>
      </div>

      <!-- Table Area -->
      <div class="flex-1 overflow-auto bg-white dark:bg-slate-900 rounded-b-lg border border-slate-200 dark:border-slate-700 border-t-0 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
        <table
          ref="tableRef"
          class="text-left border-collapse table-fixed w-full"
          :style="{ width: totalWidth ? `${totalWidth}px` : '100%', minWidth: '100%' }"
        >
          <colgroup>
            <col
              v-for="col in data?.columns"
              :key="col"
              :style="{ width: (columnWidths[col] || 150) + 'px' }"
              :ref="(el) => { if (el) colRefs.set(col, el as HTMLTableColElement); }"
            />
            <col style="width: 70px" />
          </colgroup>
          <thead class="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800 shadow-sm">
            <tr>
              <th
                v-for="col in data?.columns"
                :key="col"
                class="relative px-4 py-2 border-b border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 group/header"
              >
                <div
                  class="flex items-center cursor-pointer hover:text-blue-600 dark:hover:text-white select-none transition-colors"
                  @click="handleSort(col)"
                >
                  <span class="truncate">{{ col }}</span>
                  <div v-if="sortIconMap[col]" class="flex items-center gap-0.5 ml-1 text-blue-600 dark:text-blue-400">
                    <ArrowDown v-if="sortIconMap[col]!.direction === 'DESC'" :size="14" />
                    <ArrowUp v-else :size="14" />
                    <span v-if="sort.length > 1" class="text-[10px] bg-blue-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                      {{ sortIconMap[col]!.index }}
                    </span>
                  </div>
                </div>
                <div
                  @mousedown.prevent="handleMouseDown($event, col)"
                  class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-10"
                  :class="[resizingColumn?.name === col ? 'bg-blue-500' : 'bg-transparent group-hover/header:bg-slate-300 dark:group-hover/header:bg-slate-600']"
                />
              </th>
              <th class="px-2 py-2 border-b border-slate-200 dark:border-slate-700 w-[70px]"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800/50">
            <!-- New row form -->
            <tr v-if="newRowMode" class="bg-emerald-50/50 dark:bg-emerald-500/5 border-b border-emerald-200 dark:border-emerald-800">
              <td v-for="col in data?.columns" :key="col" class="px-2 py-1 border-r border-slate-100 dark:border-slate-800/30 last:border-r-0">
                <div class="flex items-center gap-1">
                  <input
                    v-if="!newRowValues[col]?.isNull"
                    :value="newRowValues[col]?.value ?? ''"
                    @input="updateCell(col, ($event.target as HTMLInputElement).value, false)"
                    class="w-full min-w-0 px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span v-else class="text-slate-400 dark:text-slate-600 italic text-xs px-1">NULL</span>
                  <button
                    type="button"
                    @click="updateCell(col, '', !newRowValues[col]?.isNull)"
                    class="shrink-0 text-[10px] px-1 py-0.5 rounded border transition-colors"
                    :class="newRowValues[col]?.isNull
                      ? 'border-orange-400 text-orange-500 bg-orange-50 dark:bg-orange-500/10'
                      : 'border-slate-300 dark:border-slate-600 text-slate-400 hover:text-orange-500 hover:border-orange-400'"
                  >NULL</button>
                </div>
              </td>
              <td class="px-2 py-1 w-[70px]">
                <div class="flex items-center gap-0.5 justify-end">
                  <button @click="saveNewRow" :disabled="savingRow" class="p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 rounded transition-colors disabled:opacity-50">
                    <Check :size="14" />
                  </button>
                  <button @click="cancelEdit" class="p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">
                    <X :size="14" />
                  </button>
                </div>
              </td>
            </tr>

            <DataRow
              v-for="(row, i) in data?.rows"
              :key="getRowKey(row, i)"
              v-memo="[row, data?.columns, editingRowIndex === i, editingRowIndex === i ? editValues : null]"
              :row="row"
              :columns="data?.columns || []"
              :rowIndex="i"
              :isEditing="editingRowIndex === i"
              :editValues="editingRowIndex === i ? editValues : undefined"
              :canEdit="canEdit"
              @startEdit="startEdit"
              @saveEdit="saveEdit"
              @cancelEdit="cancelEdit"
              @deleteRow="deleteRow"
              @updateCell="updateCell"
            />
            <tr v-if="data && data.rows.length === 0 && !newRowMode">
              <td :colspan="(data.columns.length || 0) + 1" class="px-4 py-8 text-center text-slate-500 italic">
                {{ $t('data_table.no_data') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <CsvImportModal
      v-if="showImportModal"
      :serverName="serverName"
      :database="database"
      :table="table"
      :tableColumns="data?.columns || columnInfo.map(c => c.name)"
      @close="showImportModal = false"
      @imported="fetchData"
    />
  </div>
</template>
