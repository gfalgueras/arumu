<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { X, FileText, Upload, Loader2 } from 'lucide-vue-next';
import { $t } from '../i18n';
import { api } from '../services/api';
import { showError } from '../errorService';

const props = defineProps<{
  serverName: string;
  database: string;
  table: string;
  tableColumns: string[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'imported'): void;
}>();

const filePath = ref('');
const rawContent = ref('');
const firstRowIsHeader = ref(true);
const importing = ref(false);

// Parsed CSV state
const csvHeaders = ref<string[]>([]);
const csvRows = ref<string[][]>([]);
const columnMapping = ref<Record<number, string>>({});

const previewRows = computed(() => csvRows.value.slice(0, 5));

const parseCsv = (content: string): string[][] => {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  return lines.map(line => {
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        cols.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current);
    return cols;
  });
};

const selectFile = async () => {
  const result = await api.openFileDialog([{ name: 'CSV Files', extensions: ['csv', 'txt'] }]);
  if (!result) return;
  filePath.value = result.filePath;
  rawContent.value = result.content;

  try {
    const allRows = parseCsv(result.content);
    if (allRows.length === 0) return;

    if (firstRowIsHeader.value) {
      csvHeaders.value = allRows[0];
      csvRows.value = allRows.slice(1);
    } else {
      csvHeaders.value = allRows[0].map((_, i) => `Column ${i + 1}`);
      csvRows.value = allRows;
    }

    // Auto-map: match CSV header to table column by name (case-insensitive)
    const mapping: Record<number, string> = {};
    for (let i = 0; i < csvHeaders.value.length; i++) {
      const hdr = csvHeaders.value[i].toLowerCase().trim();
      const match = props.tableColumns.find(c => c.toLowerCase() === hdr);
      mapping[i] = match || '';
    }
    columnMapping.value = mapping;
  } catch {
    showError($t('import.error_parse'));
  }
};

watch(firstRowIsHeader, () => {
  if (!rawContent.value) return;
  try {
    const allRows = parseCsv(rawContent.value);
    if (firstRowIsHeader.value) {
      csvHeaders.value = allRows[0] || [];
      csvRows.value = allRows.slice(1);
    } else {
      csvHeaders.value = (allRows[0] || []).map((_, i) => `Column ${i + 1}`);
      csvRows.value = allRows;
    }
  } catch {
    // malformed CSV — leave headers/rows unset, form validation catches it
  }
});

const escId = (s: string) => '`' + s.replace(/`/g, '``') + '`';
const escVal = (val: string): string => {
  if (val === '') return 'NULL';
  const n = Number(val);
  if (!isNaN(n) && val.trim() !== '') return val;
  return "'" + val.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
};

const doImport = async () => {
  if (csvRows.value.length === 0) return;
  importing.value = true;

  const mappedCols = Object.entries(columnMapping.value)
    .filter(([, col]) => col !== '')
    .map(([idx, col]) => ({ idx: Number(idx), col }));

  if (mappedCols.length === 0) {
    showError($t('import.error'));
    importing.value = false;
    return;
  }

  const colList = mappedCols.map(({ col }) => escId(col)).join(', ');
  let imported = 0;

  try {
    for (const row of csvRows.value) {
      const vals = mappedCols.map(({ idx }) => escVal(row[idx] ?? '')).join(', ');
      await api.executeSql(
        props.serverName,
        `INSERT INTO ${escId(props.table)} (${colList}) VALUES (${vals})`,
        props.database
      );
      imported++;
    }
    alert($t('import.success').replace('{n}', String(imported)));
    emit('imported');
    emit('close');
  } catch (err) {
    const msg = (err instanceof Error ? err.message : undefined)?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || String(err);
    showError($t('import.error'), msg);
  } finally {
    importing.value = false;
  }
};
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm px-4" @click.self="emit('close')">
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">

      <!-- Header -->
      <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 shrink-0">
        <div class="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold">
          <Upload :size="18" class="text-blue-600" />
          <span>{{ $t('import.title') }} <code class="text-blue-600 dark:text-blue-400 font-mono text-sm">{{ table }}</code></span>
        </div>
        <button @click="emit('close')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-100 p-1 rounded transition-colors">
          <X :size="20" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <!-- File selection -->
        <div class="flex items-center gap-3">
          <button
            @click="selectFile"
            class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <FileText :size="15" />
            {{ $t('import.select_file') }}
          </button>
          <span v-if="filePath" class="text-sm text-slate-500 dark:text-slate-400 font-mono truncate flex-1">{{ filePath }}</span>
          <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 ml-auto shrink-0">
            <input type="checkbox" v-model="firstRowIsHeader" class="rounded" />
            {{ $t('import.first_row_header') }}
          </label>
        </div>

        <!-- Column mapping -->
        <div v-if="csvHeaders.length > 0">
          <h3 class="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{{ $t('import.columns_mapping') }}</h3>
          <div class="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">#</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">{{ $t('import.csv_column') }}</th>
                  <th class="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">{{ $t('import.table_column') }}</th>
                  <th v-for="(row, ri) in previewRows" :key="ri" class="px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-500">
                    row {{ ri + 1 }}
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800/50">
                <tr v-for="(hdr, i) in csvHeaders" :key="i" class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td class="px-3 py-1.5 text-xs text-slate-400">{{ i + 1 }}</td>
                  <td class="px-3 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-300">{{ hdr }}</td>
                  <td class="px-3 py-1.5">
                    <select
                      v-model="columnMapping[i]"
                      class="w-full text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">{{ $t('import.skip') }}</option>
                      <option v-for="col in tableColumns" :key="col" :value="col">{{ col }}</option>
                    </select>
                  </td>
                  <td v-for="(row, ri) in previewRows" :key="ri" class="px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono max-w-[100px] truncate">
                    {{ row[i] ?? '' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-xs text-slate-400 mt-1">{{ csvRows.length }} rows to import (showing 5 preview rows)</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 shrink-0">
        <button @click="emit('close')" class="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 transition-colors">
          {{ $t('common.cancel') }}
        </button>
        <button
          @click="doImport"
          :disabled="csvRows.length === 0 || importing"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-lg transition-colors"
        >
          <Loader2 v-if="importing" :size="14" class="animate-spin" />
          <Upload v-else :size="14" />
          {{ importing ? $t('import.importing') : $t('import.import_btn') }}
        </button>
      </div>
    </div>
  </div>
</template>
