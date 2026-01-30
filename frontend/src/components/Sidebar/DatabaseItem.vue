<script setup lang="ts">
import { computed, watch } from 'vue';
import { Database, ChevronRight, ChevronDown, Loader2 } from 'lucide-vue-next';
import TableItem from './TableItem.vue';

const props = defineProps<{
  name: string;
  size?: number;
  tables: { name: string; size?: number }[];
  filterTable: string;
  isSelected: boolean;
  selectedTable: string | null;
  isOpen: boolean;
  isLoading?: boolean;
  loadingTables?: string[];
  expandedTableIds: string[];
}>();

const emit = defineEmits<{
  (e: 'toggle', open: boolean): void;
  (e: 'select'): void;
  (e: 'selectTable', table: string): void;
  (e: 'expand'): void;
  (e: 'expandTable', table: string): void;
  (e: 'toggleTable', table: string, open: boolean): void;
}>();

watch(() => props.isOpen, (newVal) => {
  if (newVal && props.tables.length === 0 && !props.isLoading) {
    emit('expand');
  }
}, { immediate: true });

const filteredTables = computed(() => 
  props.tables.filter(t => 
    t.name.toLowerCase().includes(props.filterTable.toLowerCase())
  )
);

const shouldShow = computed(() => {
  if (!props.filterTable) return true;
  if (filteredTables.value.length > 0) return true;
  if (props.tables.length === 0) return true;
  return false;
});

const formatSize = (bytes?: number) => {
  if (bytes === undefined) return '';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const handleSelect = () => {
  if (!props.isOpen) emit('toggle', true);
  emit('select');
};
</script>

<template>
  <div v-if="shouldShow">
    <div 
      class="flex items-center gap-2 py-1.5 px-8 hover:bg-slate-700 cursor-pointer overflow-hidden group"
      :class="isSelected ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'"
      @click.stop="handleSelect"
    >
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <div 
          class="flex-shrink-0 hover:bg-slate-600 rounded p-0.5 -m-0.5"
          @click.stop="emit('toggle', !isOpen)"
        >
          <ChevronDown v-if="isOpen" :size="14" />
          <ChevronRight v-else :size="14" />
        </div>
        <Database :size="16" class="flex-shrink-0" :class="isSelected ? 'text-blue-400' : 'text-blue-400'" />
        <span class="text-sm font-medium truncate flex-1">{{ name }}</span>
        <span class="text-[10px] text-slate-500 group-hover:text-slate-300 flex-shrink-0 mr-1">
          {{ formatSize(size) }}
        </span>
      </div>
      <Loader2 v-if="isLoading" :size="14" class="animate-spin text-blue-500 flex-shrink-0" />
    </div>
    <div v-if="isOpen" class="bg-slate-800/30">
      <TableItem 
        v-for="table in filteredTables"
        :key="table.name" 
        v-memo="[table.name, table.size, (table as any).columns, selectedTable === table.name, expandedTableIds.includes(table.name), loadingTables?.includes(table.name)]"
        :name="table.name" 
        :size="table.size"
        :columns="(table as any).columns"
        :isSelected="selectedTable === table.name"
        :isOpen="expandedTableIds.includes(table.name)"
        :isLoading="loadingTables?.includes(table.name)"
        @toggle="(open) => emit('toggleTable', table.name, open)"
        @select="emit('selectTable', table.name)"
        @expand="emit('expandTable', table.name)"
      />
      <div v-if="!isLoading && filteredTables.length === 0 && tables.length > 0" class="pl-12 py-1 text-xs text-slate-500 italic">
        No tables found
      </div>
      <div v-if="!isLoading && tables.length === 0" class="pl-12 py-1 text-xs text-slate-500 italic">
        No tables
      </div>
    </div>
  </div>
</template>
