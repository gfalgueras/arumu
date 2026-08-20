<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, shallowRef, nextTick } from 'vue';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUp, ArrowDown, Loader2, Download, ChevronDown, Plus, Check, X, Upload,
  Copy, Clipboard, Type, Trash2, ChevronRight as SubArrow
} from 'lucide-vue-next';
import type { SortConfig, TableDataResponse, ColumnInfo, ServerInfo } from '@shared/types/database';
import { showError } from '../errorService';
import { $t } from '../i18n';
import { api } from '../services/api';
import { hotkeys, matchesHotkey } from '../hotkeys';
import DataRow from './DataTable/DataRow.vue';
import FilterInput from './DataTable/FilterInput.vue';
import CsvImportModal from './CsvImportModal.vue';
import ConfirmModal from './ConfirmModal.vue';
import { skipUpdateConfirm, skipDeleteConfirm } from '../services/confirmService';
import { tableDataCache } from '../services/tableDataCache';

const props = defineProps<{
  serverName: string;
  serverType: ServerInfo['type'];
  database: string;
  table: string;
}>();

interface EditCell { value: string; isNull: boolean; }
interface ContextMenuState {
  x: number;
  y: number;
  rowIndex: number;
  col: string;
  colValue: unknown;
}

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
const colRefs = new Map<string, HTMLTableColElement>();
const limit = 1000;

const columnInfo = ref<ColumnInfo[]>([]);
const savingCell = ref(false);

// Cell selection + editing
const selectedCell = ref<{ rowIndex: number; col: string } | null>(null);
const editingCell = ref<{ rowIndex: number; col: string } | null>(null);
const editingValue = ref<EditCell>({ value: '', isNull: false });

// Context menu
const contextMenu = ref<ContextMenuState | null>(null);
const contextMenuRef = ref<HTMLElement | null>(null);

// New row form
const newRowMode = ref(false);
const newRowValues = shallowRef<Record<string, EditCell>>({});

// Export
const showExportMenu = ref(false);
const exportMenuRef = ref<HTMLElement | null>(null);

// Import
const showImportModal = ref(false);

// Confirmation dialog
interface ConfirmState { type: 'update' | 'delete'; sql: string; resolve: (ok: boolean) => void; }
const confirmState = ref<ConfirmState | null>(null);

const showConfirm = (type: 'update' | 'delete', sql: string): Promise<boolean> =>
  new Promise(resolve => { confirmState.value = { type, sql, resolve }; });

const onConfirmResult = (ok: boolean, skip: boolean) => {
  if (skip) {
    if (confirmState.value?.type === 'update') skipUpdateConfirm.value = true;
    else skipDeleteConfirm.value = true;
  }
  const resolve = confirmState.value?.resolve;
  confirmState.value = null;
  resolve?.(ok);
};

const pkColumns = computed(() =>
  columnInfo.value.filter(c => c.key === 'PRI').map(c => c.name)
);
const canEdit = computed(() => pkColumns.value.length > 0);

const sortIconMap = computed(() => {
  const map: Record<string, { direction: 'ASC' | 'DESC'; index: number } | undefined> = {};
  for (let i = 0; i < sort.value.length; i++) {
    const s = sort.value[i];
    map[s.column] = { direction: s.direction, index: i + 1 };
  }
  return map;
});

// Per-instance flags — not shared across DataTable instances
let _initializing = true;
let _blockPaginationFetch = false;

// Fires when the user navigates to a different table
watch(
  () => [props.serverName, props.database, props.table] as const,
  async () => {
    if (_initializing) return;
    _blockPaginationFetch = true;
    columnWidths.value = {};
    selectedCell.value = null;
    editingCell.value = null;
    newRowMode.value = false;
    contextMenu.value = null;
    page.value = 0;
    sort.value = [];
    appliedFilter.value = '';
    try {
      columnInfo.value = await api.getColumns(props.serverName, props.database, props.table);
    } catch { columnInfo.value = []; }
    await fetchData();
    await nextTick();
    _blockPaginationFetch = false;
  }
);

// Fires on pagination / sort / filter changes initiated by the user
watch([page, appliedFilter, sort], () => {
  if (_initializing || _blockPaginationFetch) return;
  fetchData();
}, { deep: true });

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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error.value = msg;
    showError($t('data_table.error_load'), msg);
  } finally {
    loading.value = false;
  }
};


const handleSort = (column: string) => {
  if (editingCell.value || newRowMode.value) return;
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

const getRowKey = (row: Record<string, unknown>, i: number): string | number => {
  if (pkColumns.value.length > 0) {
    return pkColumns.value.map(pk => row[pk]).join('§');
  }
  return i;
};

// ---- Cell selection & editing ----

const selectCell = (rowIndex: number, col: string) => {
  if (editingCell.value) cancelEditCell();
  selectedCell.value = { rowIndex, col };
};

const startEditCell = (rowIndex: number, col: string) => {
  if (!canEdit.value || !data.value) return;
  const row = data.value.rows[rowIndex];
  editingCell.value = { rowIndex, col };
  editingValue.value = {
    value: row[col] === null ? '' : String(row[col]),
    isNull: row[col] === null,
  };
  selectedCell.value = { rowIndex, col };
  contextMenu.value = null;
};

const cancelEditCell = () => {
  editingCell.value = null;
};

const updateEditValue = (value: string, isNull: boolean) => {
  editingValue.value = { value, isNull };
};

const saveEditCell = async () => {
  if (!editingCell.value || !data.value || savingCell.value) return;
  const { rowIndex, col } = editingCell.value;
  const setExpr = editingValue.value.isNull ? 'NULL' : escVal(editingValue.value.value);
  const whereClauses = pkColumns.value
    .map(pk => `${escId(pk)} = ${escVal(data.value!.rows[rowIndex][pk] === null ? null : String(data.value!.rows[rowIndex][pk]))}`)
    .join(' AND ');
  const sql = `UPDATE ${escId(props.table)} SET ${escId(col)} = ${setExpr} WHERE ${whereClauses}`;
  if (!skipUpdateConfirm.value) {
    const ok = await showConfirm('update', sql);
    if (!ok) return;
  }
  savingCell.value = true;
  try {
    await api.executeSql(props.serverName, sql, props.database);
    await fetchData();
    editingCell.value = null;
  } catch {
    // error already logged by log panel
  } finally {
    savingCell.value = false;
  }
};

// ---- Context menu ----

const openContextMenu = (e: MouseEvent, rowIndex: number, col: string) => {
  if (editingCell.value) cancelEditCell();
  selectedCell.value = { rowIndex, col };
  const menuWidth = 210;
  const menuHeight = 240;
  contextMenu.value = {
    x: Math.min(e.clientX, window.innerWidth - menuWidth - 8),
    y: Math.min(e.clientY, window.innerHeight - menuHeight - 8),
    rowIndex,
    col,
    colValue: data.value?.rows[rowIndex]?.[col],
  };
};

const closeContextMenu = () => {
  contextMenu.value = null;
};

const copyCell = async () => {
  if (!contextMenu.value) return;
  const val = contextMenu.value.colValue;
  await navigator.clipboard.writeText(val === null ? '' : String(val));
  closeContextMenu();
};

const pasteCell = async () => {
  if (!contextMenu.value || !canEdit.value) return;
  const { rowIndex, col } = contextMenu.value;
  closeContextMenu();
  try {
    const text = await navigator.clipboard.readText();
    startEditCell(rowIndex, col);
    editingValue.value = { value: text, isNull: false };
  } catch {
    // clipboard access denied
  }
};

const insertValue = async (value: string | null, isExpression: boolean) => {
  if (!contextMenu.value || !data.value || !canEdit.value) return;
  const { rowIndex, col } = contextMenu.value;
  closeContextMenu();
  const setExpr = value === null ? 'NULL' : isExpression ? value : escVal(value);
  const whereClauses = pkColumns.value
    .map(pk => `${escId(pk)} = ${escVal(data.value!.rows[rowIndex][pk] === null ? null : String(data.value!.rows[rowIndex][pk]))}`)
    .join(' AND ');
  const sql = `UPDATE ${escId(props.table)} SET ${escId(col)} = ${setExpr} WHERE ${whereClauses}`;
  if (!skipUpdateConfirm.value) {
    const ok = await showConfirm('update', sql);
    if (!ok) return;
  }
  savingCell.value = true;
  try {
    await api.executeSql(props.serverName, sql, props.database);
    await fetchData();
  } catch {
    // error already logged by log panel
  } finally {
    savingCell.value = false;
  }
};

const deleteRow = async () => {
  if (!contextMenu.value || !data.value) return;
  const rowIndex = contextMenu.value.rowIndex;
  const whereClauses = pkColumns.value
    .map(pk => `${escId(pk)} = ${escVal(data.value!.rows[rowIndex][pk] === null ? null : String(data.value!.rows[rowIndex][pk]))}`)
    .join(' AND ');
  const sql = `DELETE FROM ${escId(props.table)} WHERE ${whereClauses}`;
  closeContextMenu();
  if (!skipDeleteConfirm.value) {
    const ok = await showConfirm('delete', sql);
    if (!ok) return;
  }
  savingCell.value = true;
  try {
    await api.executeSql(props.serverName, sql, props.database);
    selectedCell.value = null;
    await fetchData();
  } catch {
    // error already logged by log panel
  } finally {
    savingCell.value = false;
  }
};

// Insert value submenu options based on column type
const contextInsertOptions = computed(() => {
  if (!contextMenu.value) return [];
  const col = contextMenu.value.col;
  const ci = columnInfo.value.find(c => c.name === col);
  const type = (ci?.type || '').toUpperCase();
  const options: Array<{ label: string; value: string | null; isExpression: boolean }> = [
    { label: 'NULL', value: null, isExpression: false },
  ];
  if (type.includes('DATETIME') || type.includes('TIMESTAMP')) {
    options.push({ label: 'NOW()', value: 'NOW()', isExpression: true });
    options.push({ label: 'CURRENT_TIMESTAMP()', value: 'CURRENT_TIMESTAMP()', isExpression: true });
  }
  if (type === 'DATE') {
    options.push({ label: 'CURDATE()', value: 'CURDATE()', isExpression: true });
  }
  if (type.includes('UUID')) {
    options.push({ label: 'UUID()', value: 'UUID()', isExpression: true });
  }
  if (type.startsWith('TINYINT') || type.startsWith('BOOLEAN') || type.startsWith('BOOL')) {
    options.push({ label: '1 (TRUE)', value: '1', isExpression: false });
    options.push({ label: '0 (FALSE)', value: '0', isExpression: false });
  }
  if (type.includes('JSON')) {
    options.push({ label: '{} (object)', value: '{}', isExpression: false });
    options.push({ label: '[] (array)', value: '[]', isExpression: false });
  }
  return options;
});

// ---- New row form ----

const updateNewRowCell = (col: string, value: string, isNull: boolean) => {
  newRowValues.value = { ...newRowValues.value, [col]: { value, isNull } };
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
  selectedCell.value = null;
  editingCell.value = null;
  contextMenu.value = null;
};

const cancelNewRow = () => {
  newRowMode.value = false;
  newRowValues.value = {};
};

const saveNewRow = async () => {
  if (!data.value || savingCell.value) return;
  savingCell.value = true;
  try {
    const columns = data.value.columns.filter((col: string) => {
      const cell = newRowValues.value[col];
      const ci = columnInfo.value.find((c: ColumnInfo) => c.name === col);
      const isAutoIncrement = ci?.extra?.toUpperCase().includes('AUTO_INCREMENT');
      const hasValue = cell && !cell.isNull && cell.value !== '';
      return !(isAutoIncrement && !hasValue);
    });
    const cols = columns.map(escId).join(', ');
    const vals = columns
      .map(col => valOrExpr(newRowValues.value[col]?.isNull ? null : newRowValues.value[col]?.value ?? ''))
      .join(', ');
    await api.executeSql(props.serverName, `INSERT INTO ${escId(props.table)} (${cols}) VALUES (${vals})`, props.database);
    newRowMode.value = false;
    newRowValues.value = {};
    await fetchData();
  } catch {
    // error already logged by log panel
  } finally {
    savingCell.value = false;
  }
};

// ---- Column resize ----

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
    tableRef.value.style.width = `${resizingColumn.value.otherColumnsTotalWidth + newWidth}px`;
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

const handleKeyNav = (e: KeyboardEvent) => {
  if (e.key === 'F5' || matchesHotkey(e, hotkeys.executeAll) || matchesHotkey(e, hotkeys.executeStatement)) {
    e.preventDefault(); fetchData(); return;
  }
  if (!selectedCell.value || editingCell.value || newRowMode.value || !data.value) return;
  const cols = data.value.columns;
  const { rowIndex, col } = selectedCell.value;
  const colIdx = cols.indexOf(col);

  if (e.key === 'ArrowRight') {
    if (colIdx < cols.length - 1) { e.preventDefault(); selectedCell.value = { rowIndex, col: cols[colIdx + 1] }; }
  } else if (e.key === 'ArrowLeft') {
    if (colIdx > 0) { e.preventDefault(); selectedCell.value = { rowIndex, col: cols[colIdx - 1] }; }
  } else if (e.key === 'ArrowDown') {
    if (rowIndex < data.value.rows.length - 1) { e.preventDefault(); selectedCell.value = { rowIndex: rowIndex + 1, col }; }
  } else if (e.key === 'ArrowUp') {
    if (rowIndex > 0) { e.preventDefault(); selectedCell.value = { rowIndex: rowIndex - 1, col }; }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    startEditCell(rowIndex, col);
  } else if (e.key === 'Escape') {
    selectedCell.value = null;
  }
};

const handleGlobalClick = (e: MouseEvent) => {
  // Close export menu
  if (exportMenuRef.value && !exportMenuRef.value.contains(e.target as Node)) {
    showExportMenu.value = false;
  }
  // Close context menu if clicking outside
  if (contextMenu.value && contextMenuRef.value && !contextMenuRef.value.contains(e.target as Node)) {
    closeContextMenu();
  }
  // Deselect cell if clicking outside the table
  if (tableRef.value && !tableRef.value.contains(e.target as Node)) {
    selectedCell.value = null;
    if (editingCell.value) cancelEditCell();
  }
};

onMounted(async () => {
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
  document.addEventListener('mousedown', handleGlobalClick);
  window.addEventListener('keydown', handleKeyNav);

  const cached = tableDataCache.get(props.serverName, props.database, props.table);
  if (cached) {
    data.value = cached.data;
    columnInfo.value = cached.columnInfo;
    page.value = cached.page;
    sort.value = [...cached.sort];
    appliedFilter.value = cached.appliedFilter;
    columnWidths.value = { ...cached.columnWidths };
  } else {
    try {
      columnInfo.value = await api.getColumns(props.serverName, props.database, props.table);
    } catch { columnInfo.value = []; }
    fetchData();
  }

  await nextTick();
  _initializing = false;
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
  document.removeEventListener('mousedown', handleGlobalClick);
  window.removeEventListener('keydown', handleKeyNav);

  tableDataCache.set(props.serverName, props.database, props.table, {
    data: data.value,
    columnInfo: columnInfo.value,
    page: page.value,
    sort: [...sort.value],
    appliedFilter: appliedFilter.value,
    columnWidths: { ...columnWidths.value },
  });
});

const totalPages = computed(() => data.value ? Math.ceil(data.value.total / limit) : 0);
const totalWidth = computed(() => {
  return data.value?.columns.reduce((acc, col) => acc + (columnWidths.value[col] || 150), 0) || 0;
});

// ---- SQL helpers ----

const escId = (s: string) => '`' + s.replace(/`/g, '``') + '`';
const escVal = (val: string | null): string => {
  if (val === null) return 'NULL';
  const n = Number(val);
  if (!isNaN(n) && val.trim() !== '') return val;
  return "'" + val.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
};
const SQL_EXPR_RE = /^(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|DEFAULT|TRUE|FALSE|NULL)$/i;
const isSqlExpr = (val: string) => SQL_EXPR_RE.test(val.trim()) || val.includes('(');
const valOrExpr = (val: string | null): string => {
  if (val === null) return 'NULL';
  if (isSqlExpr(val)) return val;
  return escVal(val);
};

// ---- Export ----

const csvEscape = (val: unknown): string => {
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
  await api.saveExportFile(`${props.table}.csv`, content, [{ name: 'CSV Files', extensions: ['csv'] }]);
};

const exportAllCsv = async () => {
  showExportMenu.value = false;
  try {
    await api.exportTableData(props.serverName, props.database, props.table, 'csv', appliedFilter.value, sort.value);
  } catch {
    showError($t('data_table.error_export'));
  }
};

const exportSql = async () => {
  showExportMenu.value = false;
  try {
    await api.exportTableData(props.serverName, props.database, props.table, 'sql', appliedFilter.value, sort.value);
  } catch {
    showError($t('data_table.error_export'));
  }
};
</script>

<template>
  <div
    class="flex-1 flex flex-col min-h-0 w-full min-w-0 relative"
    :class="resizingColumn ? 'cursor-col-resize select-none' : ''"
  >
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
            @click="newRowMode ? cancelNewRow() : startNewRow()"
            :disabled="savingCell"
            class="flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors"
            :class="newRowMode
              ? 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400'
              : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600'"
          >
            <X v-if="newRowMode" :size="13" />
            <Plus v-else :size="13" />
            <span>{{ newRowMode ? $t('data_table.cancel_edit') : $t('data_table.add_row') }}</span>
          </button>

          <span v-else-if="data && !canEdit" class="text-xs text-amber-500 dark:text-amber-400 italic">
            {{ $t('data_table.no_primary_key') }}
          </span>

          <!-- Import -->
          <button
            @click="showImportModal = true"
            class="flex items-center gap-1 px-2 py-1.5 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 rounded-lg transition-colors"
          >
            <Upload :size="13" />
            <span>{{ $t('import.import') }}</span>
          </button>

          <!-- Export -->
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
                  :class="resizingColumn?.name === col ? 'bg-blue-500' : 'bg-transparent group-hover/header:bg-slate-300 dark:group-hover/header:bg-slate-600'"
                />
              </th>
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
                    @input="updateNewRowCell(col, ($event.target as HTMLInputElement).value, false)"
                    @keydown.enter.prevent="saveNewRow"
                    @keydown.escape.prevent="cancelNewRow"
                    class="w-full min-w-0 px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span v-else class="text-slate-400 dark:text-slate-600 italic text-xs px-1">NULL</span>
                  <button
                    type="button"
                    @click="updateNewRowCell(col, '', !newRowValues[col]?.isNull)"
                    class="shrink-0 text-[10px] px-1 py-0.5 rounded border transition-colors"
                    :class="newRowValues[col]?.isNull
                      ? 'border-orange-400 text-orange-500 bg-orange-50 dark:bg-orange-500/10'
                      : 'border-slate-300 dark:border-slate-600 text-slate-400 hover:text-orange-500 hover:border-orange-400'"
                  >NULL</button>
                </div>
              </td>
            </tr>
            <!-- New row save/cancel hint -->
            <tr v-if="newRowMode" class="bg-emerald-50/30 dark:bg-emerald-500/5">
              <td :colspan="data?.columns.length" class="px-3 py-1 border-b border-emerald-200 dark:border-emerald-800">
                <div class="flex items-center gap-2">
                  <button @click="saveNewRow" :disabled="savingCell" class="flex items-center gap-1 px-2 py-0.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors disabled:opacity-50">
                    <Check :size="11" /> {{ $t('common.save') }}
                  </button>
                  <button @click="cancelNewRow" class="flex items-center gap-1 px-2 py-0.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                    <X :size="11" /> {{ $t('common.cancel') }}
                  </button>
                  <span class="text-[10px] text-slate-400">Enter = guardar · Esc = cancelar</span>
                </div>
              </td>
            </tr>

            <DataRow
              v-for="(row, i) in data?.rows"
              :key="getRowKey(row, i)"
              v-memo="[
                row,
                data?.columns,
                selectedCell?.rowIndex === i ? selectedCell.col : null,
                editingCell?.rowIndex === i ? editingCell.col : null,
                editingCell?.rowIndex === i ? editingValue : null,
              ]"
              :row="row"
              :columns="data?.columns || []"
              :rowIndex="i"
              :selectedCol="selectedCell?.rowIndex === i ? selectedCell.col : null"
              :editingCol="editingCell?.rowIndex === i ? editingCell.col : null"
              :editingValue="editingValue"
              :canEdit="canEdit"
              @selectCell="selectCell(i, $event)"
              @openContextMenu="(col, evt) => openContextMenu(evt, i, col)"
              @startEditCell="startEditCell(i, $event)"
              @updateEditValue="updateEditValue"
              @saveEdit="saveEditCell"
              @cancelEdit="cancelEditCell"
            />
            <tr v-if="data && data.rows.length === 0 && !newRowMode">
              <td :colspan="data.columns.length" class="px-4 py-8 text-center text-slate-500 italic">
                {{ $t('data_table.no_data') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Context Menu (teleported to body for correct z-index) -->
    <Teleport to="body">
      <div
        v-if="contextMenu"
        ref="contextMenuRef"
        class="fixed z-[9999] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl py-1 w-52 text-sm"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @contextmenu.prevent
      >
        <!-- Copy -->
        <button
          @click="copyCell"
          class="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
        >
          <Copy :size="13" class="text-slate-400 shrink-0" />
          Copiar
          <span class="ml-auto text-[10px] text-slate-400 font-mono">Ctrl+C</span>
        </button>

        <!-- Paste -->
        <button
          @click="pasteCell"
          :disabled="!canEdit"
          class="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Clipboard :size="13" class="text-slate-400 shrink-0" />
          Pegar
          <span class="ml-auto text-[10px] text-slate-400 font-mono">Ctrl+V</span>
        </button>

        <!-- Insert value (with submenu) -->
        <div class="relative group/insert">
          <button
            :disabled="!canEdit"
            class="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Type :size="13" class="text-slate-400 shrink-0" />
            Insertar valor
            <SubArrow :size="12" class="ml-auto text-slate-400" />
          </button>
          <!-- Submenu -->
          <div
            v-if="canEdit"
            class="absolute left-full top-0 -mt-1 ml-0.5 w-52 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl py-1 hidden group-hover/insert:block"
          >
            <button
              v-for="opt in contextInsertOptions"
              :key="opt.label"
              @click="insertValue(opt.value, opt.isExpression)"
              class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
            >
              <span
                class="font-mono text-[11px]"
                :class="opt.value === null ? 'text-slate-400 italic' : opt.isExpression ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'"
              >{{ opt.label }}</span>
            </button>
          </div>
        </div>

        <div class="my-1 border-t border-slate-100 dark:border-slate-800" />

        <!-- Delete row -->
        <button
          @click="deleteRow"
          :disabled="!canEdit"
          class="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 :size="13" class="shrink-0" />
          Eliminar fila
        </button>
      </div>
    </Teleport>

    <CsvImportModal
      v-if="showImportModal"
      :serverName="serverName"
      :database="database"
      :table="table"
      :tableColumns="data?.columns || columnInfo.map(c => c.name)"
      @close="showImportModal = false"
      @imported="fetchData"
    />

    <Teleport to="body">
      <ConfirmModal
        v-if="confirmState"
        :type="confirmState.type"
        :sql="confirmState.sql"
        @confirm="(skip) => onConfirmResult(true, skip)"
        @cancel="onConfirmResult(false, false)"
      />
    </Teleport>
  </div>
</template>
