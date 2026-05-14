<script setup lang="ts">
import { ref, watch } from 'vue';
import { X, Plus } from 'lucide-vue-next';
import { $t } from '../../i18n';
import BaseButton from '../ui/BaseButton.vue';

const props = defineProps<{
  initialValue: string;
  isLoading?: boolean;
  columns: string[];
  serverType?: string;
  table?: string;
}>();

const emit = defineEmits<{
  (e: 'apply', value: string): void;
}>();

const OPERATORS = [
  { value: '=',           label: '=' },
  { value: '!=',          label: '!=' },
  { value: '>',           label: '>' },
  { value: '>=',          label: '>=' },
  { value: '<',           label: '<' },
  { value: '<=',          label: '<=' },
  { value: 'LIKE',        label: 'LIKE' },
  { value: 'NOT LIKE',    label: 'NOT LIKE' },
  { value: 'IS NULL',     label: 'IS NULL' },
  { value: 'IS NOT NULL', label: 'IS NOT NULL' },
];

interface FilterItem {
  id: number;
  column: string;
  operator: string;
  value: string;
  conjunction: 'AND' | 'OR';
}

const dropdownOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const filters = ref<FilterItem[]>([]);

const isNullOp = (op: string) => op === 'IS NULL' || op === 'IS NOT NULL';

const buildWhere = (): string => {
  const parts: string[] = [];
  for (const [i, f] of filters.value.entries()) {
    if (!f.column) continue;
    if (!isNullOp(f.operator) && !f.value) continue;
    const col = '`' + f.column.replace(/`/g, '``') + '`';
    const clause = isNullOp(f.operator)
      ? `${col} ${f.operator}`
      : `${col} ${f.operator} '${f.value.replace(/'/g, "''")}'`;
    parts.push(i === 0 ? clause : `${f.conjunction} ${clause}`);
  }
  return parts.join(' ');
};

const applyFilter = () => emit('apply', buildWhere());

const clearAll = () => {
  filters.value = [];
  emit('apply', '');
};

const removeFilter = (idx: number) => {
  filters.value.splice(idx, 1);
  applyFilter();
};

const selectColumn = (col: string) => {
  filters.value.push({ id: Date.now(), column: col, operator: '=', value: '', conjunction: 'AND' });
  dropdownOpen.value = false;
};

const onOperatorChange = (f: FilterItem) => {
  if (isNullOp(f.operator)) {
    f.value = '';
    applyFilter();
  } else if (!f.value) {
    applyFilter();
  }
};

const handleOutsideClick = (e: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target as Node))
    dropdownOpen.value = false;
};

watch(dropdownOpen, (open) => {
  if (open) document.addEventListener('mousedown', handleOutsideClick);
  else document.removeEventListener('mousedown', handleOutsideClick);
});

watch(() => props.initialValue, (v) => { if (v === '') clearAll(); });
watch(() => props.columns.join('\x00'), () => clearAll());
</script>

<template>
  <div class="flex items-center flex-wrap gap-1.5 text-xs" :class="{ 'opacity-50 pointer-events-none': isLoading }">
    <!-- Add filter button -->
    <div ref="dropdownRef" class="relative">
      <BaseButton
        variant="ghost"
        size="sm"
        class="w-40 justify-center"
        :class="{ '!border-blue-400 !text-blue-600 dark:!text-blue-400': dropdownOpen }"
        @click="dropdownOpen = !dropdownOpen"
      >
        <Plus :size="12" class="shrink-0" />
        <span class="leading-none">{{ $t('data_table.add_filter') }}</span>
      </BaseButton>

      <div
        v-if="dropdownOpen"
        class="absolute top-full left-0 right-0 mt-1 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded shadow-lg py-1 max-h-60 overflow-y-auto"
      >
        <BaseButton
          v-for="col in columns"
          :key="col"
          variant="text"
          size="xs"
          class="w-full justify-start truncate"
          :class="{ '!text-blue-600 dark:!text-blue-400 bg-blue-50 dark:bg-blue-500/10': filters.some(f => f.column === col) }"
          @click="selectColumn(col)"
        >
          {{ col }}
        </BaseButton>
      </div>
    </div>

    <!-- Separator -->
    <div v-if="filters.length > 0" class="w-px h-5 bg-slate-300 dark:bg-slate-600 self-center" />

    <!-- Filter rows -->
    <template v-for="(filter, idx) in filters" :key="filter.id">
      <!-- AND / OR conjunction -->
      <select
        v-if="idx > 0"
        v-model="filter.conjunction"
        class="h-[30px] px-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-700 dark:text-slate-300 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-xs"
        @change="applyFilter"
      >
        <option value="AND">AND</option>
        <option value="OR">OR</option>
      </select>

      <!-- Input group -->
      <div class="flex items-center">
        <span class="h-[30px] flex items-center px-2 bg-blue-50 dark:bg-blue-500/15 border border-blue-300 dark:border-blue-600 border-r-0 rounded-l text-blue-700 dark:text-blue-300 font-medium max-w-[120px] truncate">
          {{ filter.column }}
        </span>

        <select
          v-model="filter.operator"
          class="h-[30px] px-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 border-r-0 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-xs"
          @change="onOperatorChange(filter)"
        >
          <option v-for="op in OPERATORS" :key="op.value" :value="op.value">{{ op.label }}</option>
        </select>

        <input
          v-if="!isNullOp(filter.operator)"
          v-model="filter.value"
          type="text"
          :placeholder="$t('data_table.filter_value')"
          class="h-[30px] px-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 border-r-0 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 w-32 text-xs"
          @keydown.enter="applyFilter"
        />

        <BaseButton
          variant="icon"
          class="h-[30px] px-2 rounded-l-none rounded-r border border-slate-300 dark:border-slate-600 hover:!text-red-500 dark:hover:!text-red-400"
          :title="$t('data_table.filter_clear')"
          @click="removeFilter(idx)"
        >
          <X :size="12" />
        </BaseButton>
      </div>
    </template>
  </div>
</template>
