<script setup lang="ts">
import { computed, watch } from 'vue';
import { Server, ChevronRight, ChevronDown, Loader2 } from 'lucide-vue-next';
import DatabaseItem from './DatabaseItem.vue';

const props = defineProps<{
  id: string;
  name: string;
  type: string;
  databases: { name: string; size?: number; tables: { name: string; size?: number }[] }[];
  filterDatabase: string;
  filterTable: string;
  isSelected: boolean;
  selectedDatabase: string | null;
  selectedTable: string | null;
  isOpen: boolean;
  isLoading?: boolean;
  loadingDatabases?: string[];
  expandedDatabaseIds: string[];
}>();

const emit = defineEmits<{
  (e: 'toggle', open: boolean): void;
  (e: 'select'): void;
  (e: 'selectDatabase', db: string): void;
  (e: 'selectTable', dbName: string, table: string): void;
  (e: 'expand'): void;
  (e: 'expandDatabase', db: string): void;
  (e: 'contextMenu', event: MouseEvent, id: string): void;
  (e: 'toggleDatabase', db: string, open: boolean): void;
}>();

watch(() => props.isOpen, (newVal) => {
  if (newVal && props.databases.length === 0 && !props.isLoading) {
    emit('expand');
  }
}, { immediate: true });

const filteredDatabases = computed(() => 
  props.databases.filter(db => 
    db.name.toLowerCase().includes(props.filterDatabase.toLowerCase()) &&
    (props.filterTable === '' || db.tables.length === 0 || db.tables.some(t => t.name.toLowerCase().includes(props.filterTable.toLowerCase())))
  )
);

const shouldShow = computed(() => {
  if (!props.filterDatabase) return true;
  if (filteredDatabases.value.length > 0) return true;
  if (props.databases.length === 0) return true;
  return false;
});

const handleSelect = () => {
  if (!props.isOpen) emit('toggle', true);
  emit('select');
};
</script>

<template>
  <div v-if="shouldShow">
    <div 
      class="flex items-center gap-2 py-2 px-4 hover:bg-slate-700 cursor-pointer overflow-hidden"
      :class="isSelected ? 'bg-blue-600/20 border-l-2 border-blue-500' : 'text-slate-200'"
      @click.stop="handleSelect"
      @contextmenu.prevent="emit('contextMenu', $event, id)"
    >
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <div 
          class="flex-shrink-0 hover:bg-slate-600 rounded p-0.5 -m-0.5"
          @click.stop="emit('toggle', !isOpen)"
        >
          <ChevronDown v-if="isOpen" :size="16" />
          <ChevronRight v-else :size="16" />
        </div>
        <Server :size="18" class="flex-shrink-0" :class="isSelected ? 'text-blue-400' : 'text-emerald-400'" />
        <span class="font-semibold truncate">{{ name }}</span>
      </div>
      <Loader2 v-if="isLoading" :size="16" class="animate-spin text-blue-500 flex-shrink-0" />
    </div>
    <div v-if="isOpen">
      <DatabaseItem 
        v-for="db in filteredDatabases"
        :key="db.name" 
        :name="db.name" 
        :size="db.size"
        :tables="db.tables" 
        :filterTable="filterTable"
        :isSelected="selectedDatabase === db.name"
        :selectedTable="selectedTable"
        :isOpen="expandedDatabaseIds.includes(db.name)"
        :isLoading="loadingDatabases?.includes(db.name)"
        @toggle="(open) => emit('toggleDatabase', db.name, open)"
        @select="emit('selectDatabase', db.name)"
        @selectTable="(table) => emit('selectTable', db.name, table)"
        @expand="emit('expandDatabase', db.name)"
      />
      <div v-if="!isLoading && filteredDatabases.length === 0 && databases.length > 0" class="pl-8 py-1 text-xs text-slate-500 italic">
        No databases found
      </div>
      <div v-if="!isLoading && databases.length === 0 && isOpen" class="pl-8 py-1 text-xs text-slate-500 italic">
        No databases
      </div>
    </div>
  </div>
</template>
