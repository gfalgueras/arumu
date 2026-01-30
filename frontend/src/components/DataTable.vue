<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUp, ArrowDown, Loader2 } from 'lucide-vue-next';
import type { SortConfig, TableDataResponse } from '@shared/types/database';
import DataRow from './DataTable/DataRow.vue';
import FilterInput from './DataTable/FilterInput.vue';

const props = defineProps<{
  serverId: string;
  database: string;
  table: string;
}>();

const data = ref<TableDataResponse | null>(null);
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
const colRefs = ref<Record<string, HTMLTableColElement | null>>({});
const limit = 1000;

watch(() => [props.serverId, props.database, props.table], () => {
  page.value = 0;
  sort.value = [];
  appliedFilter.value = '';
  columnWidths.value = {};
}, { immediate: true });

const fetchData = async () => {
  loading.value = true;
  error.value = null;
  try {
    const sortParam = sort.value.length > 0 ? `&sort=${encodeURIComponent(JSON.stringify(sort.value))}` : '';
    const filterParam = appliedFilter.value ? `&filter=${encodeURIComponent(appliedFilter.value)}` : '';
    const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(props.serverId)}/databases/${encodeURIComponent(props.database)}/tables/${encodeURIComponent(props.table)}/data?limit=${limit}&offset=${page.value * limit}${sortParam}${filterParam}`);
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to fetch data');
    }
    const result = await res.json();
    data.value = result;
  } catch (err: any) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
};

watch(() => [props.serverId, props.database, props.table, page.value, sort.value, appliedFilter.value], () => {
  fetchData();
}, { immediate: true });

const handleSort = (column: string) => {
  const existing = sort.value.find(s => s.column === column);
  if (!existing) {
    sort.value = [...sort.value, { column, direction: 'DESC' }];
  } else if (existing.direction === 'DESC') {
    sort.value = sort.value.map(s => s.column === column ? { ...s, direction: 'ASC' } : s);
  } else {
    sort.value = sort.value.filter(s => s.column !== column);
  }
};

const getSortIconInfo = (column: string) => {
  const s = sort.value.find(item => item.column === column);
  if (!s) return null;
  const index = sort.value.indexOf(s) + 1;
  return { direction: s.direction, index };
};

const handleApplyFilter = (val: string) => {
  page.value = 0;
  appliedFilter.value = val;
};

const handleMouseDown = (e: MouseEvent, column: string) => {
  const currentWidth = columnWidths.value[column] || 150;
  
  const otherColumnsTotalWidth = data.value?.columns.reduce((acc, col) => {
    if (col === column) return acc;
    return acc + (columnWidths.value[col] || 150);
  }, 0) || 0;

  resizingColumn.value = {
    name: column,
    startX: e.clientX,
    startWidth: currentWidth,
    otherColumnsTotalWidth
  };
};

const handleMouseMove = (e: MouseEvent) => {
  if (!resizingColumn.value) return;
  const diff = e.clientX - resizingColumn.value.startX;
  const newWidth = Math.max(50, resizingColumn.value.startWidth + diff);
  
  const colEl = colRefs.value[resizingColumn.value.name];
  if (colEl) {
    colEl.style.width = `${newWidth}px`;
  }

  if (tableRef.value) {
    const newTotalWidth = resizingColumn.value.otherColumnsTotalWidth + newWidth;
    tableRef.value.style.width = `${newTotalWidth}px`;
  }
};

const handleMouseUp = (e: MouseEvent) => {
  if (resizingColumn.value) {
    const diff = e.clientX - resizingColumn.value.startX;
    const newWidth = Math.max(50, resizingColumn.value.startWidth + diff);
    columnWidths.value = {
      ...columnWidths.value,
      [resizingColumn.value.name]: newWidth
    };
  }
  resizingColumn.value = null;
};

onMounted(() => {
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
});

const totalPages = computed(() => data.value ? Math.ceil(data.value.total / limit) : 0);
const totalWidth = computed(() => data.value?.columns.reduce((acc, col) => acc + (columnWidths.value[col] || 150), 0) || 0);
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 w-full min-w-0 relative" :class="resizingColumn ? 'cursor-col-resize select-none' : ''">
    <div v-if="loading" class="absolute inset-0 bg-slate-900/50 flex items-center justify-center z-10 rounded-lg">
      <Loader2 class="animate-spin text-blue-500" :size="48" />
    </div>

    <div v-if="error" class="flex-1 flex items-center justify-center text-red-400 p-8">
      <div class="text-center">
        <p class="text-xl font-bold mb-2">Error</p>
        <p>{{ error }}</p>
      </div>
    </div>

    <template v-else>
      <!-- Pagination Bar -->
      <div class="flex items-center justify-between p-2 bg-slate-800/50 border-b border-slate-700 rounded-t-lg min-h-[48px]">
        <div class="flex items-center gap-2 px-1">
          <FilterInput :initialValue="appliedFilter" @apply="handleApplyFilter" :isLoading="loading" />
        </div>

        <div class="flex items-center gap-4">
          <div class="text-xs text-slate-400">
            <template v-if="data">
              Showing <span class="text-slate-200 font-medium">{{ page * limit + 1 }} - {{ Math.min((page + 1) * limit, data.total) }}</span> of <span class="text-slate-200 font-medium">{{ data.total }}</span> rows
            </template>
            <template v-else>Loading...</template>
          </div>
          <div class="flex items-center gap-1 border-l border-slate-700 pl-4">
            <button 
              :disabled="page === 0 || loading"
              @click="page = 0"
              class="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronsLeft :size="18" />
            </button>
            <button 
              :disabled="page === 0 || loading"
              @click="page--"
              class="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft :size="18" />
            </button>
            <span class="text-sm px-2">Page {{ page + 1 }} of {{ totalPages || 1 }}</span>
            <button 
              :disabled="page >= totalPages - 1 || loading"
              @click="page++"
              class="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight :size="18" />
            </button>
            <button 
              :disabled="page >= totalPages - 1 || loading"
              @click="page = totalPages - 1"
              class="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronsRight :size="18" />
            </button>
          </div>
        </div>
      </div>

      <!-- Table Area -->
      <div class="flex-1 overflow-auto bg-slate-900 rounded-b-lg scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
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
              :ref="(el) => { if (el) colRefs[col] = el as HTMLTableColElement; }"
            />
          </colgroup>
          <thead class="sticky top-0 z-20 bg-slate-800 shadow-sm">
            <tr>
              <th 
                v-for="col in data?.columns"
                :key="col"
                class="relative px-4 py-2 border-b border-slate-700 text-sm font-semibold text-slate-200 group/header"
              >
                <div 
                  class="flex items-center cursor-pointer hover:text-white select-none"
                  @click="handleSort(col)"
                >
                  <span class="truncate">{{ col }}</span>
                  <div v-if="getSortIconInfo(col)" class="flex items-center gap-0.5 ml-1">
                    <ArrowDown v-if="getSortIconInfo(col)?.direction === 'DESC'" :size="14" />
                    <ArrowUp v-else :size="14" />
                    <span v-if="sort.length > 1" class="text-[10px] bg-blue-600 rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">
                      {{ getSortIconInfo(col)?.index }}
                    </span>
                  </div>
                </div>
                
                <!-- Resize Handle -->
                <div
                  @mousedown.prevent="handleMouseDown($event, col)"
                  class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 z-10"
                  :class="[resizingColumn?.name === col ? 'bg-blue-500' : 'bg-transparent group-hover/header:bg-slate-600']"
                />
              </th>
            </tr>
          </thead>
          <tbody>
            <DataRow 
              v-for="(row, i) in data?.rows"
              :key="i" 
              :row="row" 
              :columns="data?.columns || []" 
            />
            <tr v-if="data && data.rows.length === 0">
              <td :colspan="data.columns.length" class="px-4 py-8 text-center text-slate-500 italic">
                No data found in this table.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
