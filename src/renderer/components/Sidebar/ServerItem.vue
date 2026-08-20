<script setup lang="ts">
import { computed, watch, provide } from 'vue';
import { Server, ChevronRight, ChevronDown, Loader2, Check, RefreshCw } from 'lucide-vue-next';
import DatabaseItem from './DatabaseItem.vue';
import { $t } from '../../i18n';

const props = defineProps<{
  name: string;
  type: string;
  databases: { name: string; size?: number; tables: { name: string; size?: number }[] }[];
  filterDatabase: string;
  filterTable: string;
  isSelected: boolean;
  isActive: boolean;
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
  (e: 'expand', serverName: string): void;
  (e: 'expandDatabase', db: string): void;
  (e: 'contextMenu', event: MouseEvent, name: string): void;
  (e: 'toggleDatabase', db: string, open: boolean): void;
  (e: 'refresh', serverName: string): void;
}>();

const serverTotalSize = computed(() =>
  props.databases.reduce((acc, db) =>
    acc + db.tables.reduce((sum, t) => sum + (t.size || 0), 0), 0
  )
);
provide('serverTotalSize', serverTotalSize);

watch(() => props.isOpen, (newVal) => {
  if (newVal && props.databases.length === 0 && !props.isLoading) {
    emit('expand', props.name);
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
</script>

<template>
  <div v-if="shouldShow">
    <div
      class="flex items-center gap-2 py-2 px-4 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer overflow-hidden"
      :class="isSelected ? 'bg-blue-600/10 dark:bg-blue-600/20 border-l-2 border-blue-500' : 'text-slate-700 dark:text-slate-200'"
      @click.stop="emit('select')"
      @contextmenu.prevent="emit('contextMenu', $event, name)"
    >
      <div class="flex items-center gap-2 flex-1 min-w-0">
        <div
          class="flex-shrink-0 hover:bg-slate-300 dark:hover:bg-slate-600 rounded p-0.5 -m-0.5"
          @click.stop="emit('toggle', !isOpen)"
        >
          <ChevronDown v-if="isOpen" :size="16" />
          <ChevronRight v-else :size="16" />
        </div>
        <Server :size="18" class="flex-shrink-0" :class="isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'" />
        <span class="font-semibold truncate">{{ name }}</span>
        <Check v-if="isActive" :size="12" class="flex-shrink-0 text-emerald-500 dark:text-emerald-400" />
      </div>
      <Loader2 v-if="isLoading" :size="16" class="animate-spin text-blue-500 flex-shrink-0" />
      <button
        v-else
        type="button"
        class="flex-shrink-0 p-0.5 rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-300 dark:hover:bg-slate-600"
        :title="$t('sidebar.refresh_tree')"
        @click.stop="emit('refresh', name)"
      >
        <RefreshCw :size="13" />
      </button>
    </div>
    <div v-if="isOpen">
      <DatabaseItem
        v-for="db in filteredDatabases"
        :key="db.name"
        :name="db.name"
        :size="db.size"
        :tables="db.tables"
        :filterTable="filterTable"
        :isSelected="selectedDatabase === db.name && !selectedTable"
        :isActive="selectedDatabase === db.name"
        :selectedTable="selectedDatabase === db.name ? selectedTable : null"
        :isOpen="expandedDatabaseIds.includes(db.name)"
        :isLoading="loadingDatabases?.includes(db.name)"
        @toggle="(open) => emit('toggleDatabase', db.name, open)"
        @select="emit('selectDatabase', db.name)"
        @selectTable="(table) => emit('selectTable', db.name, table)"
        @expand="emit('expandDatabase', db.name)"
      />
      <div v-if="!isLoading && filteredDatabases.length === 0 && databases.length > 0" class="pl-8 py-1 text-xs text-slate-500 dark:text-slate-500 italic">
        {{ $t('sidebar.no_databases_found') }}
      </div>
      <div v-if="!isLoading && databases.length === 0 && isOpen" class="pl-8 py-1 text-xs text-slate-500 dark:text-slate-500 italic">
        {{ $t('sidebar.no_databases') }}
      </div>
    </div>
  </div>
</template>
