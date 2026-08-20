<script setup lang="ts">
import { ref, computed } from 'vue';
import { Search, Server } from 'lucide-vue-next';
import ContextMenu from './Sidebar/ContextMenu.vue';
import ServerItem from './Sidebar/ServerItem.vue';
import { $t } from '../i18n';
import { APP_VERSION } from '../config';
import type { ServerInfo, DatabaseInfo, TableInfo } from '@shared/types/database';

defineOptions({ name: 'AppSidebar' });

const props = defineProps<{
  servers: ServerInfo[];
  selectedServerName: string | null;
  selectedDatabase: string | null;
  selectedTable: string | null;
  loadingServers: string[];
  loadingDatabases: string[];
  dbFilter: string;
  tableFilter: string;
  expandedServerNames: string[];
  expandedDatabaseIds: string[];
}>();

const emit = defineEmits<{
  (e: 'update:dbFilter', val: string): void;
  (e: 'update:tableFilter', val: string): void;
  (e: 'update:expandedServerNames', val: string[]): void;
  (e: 'update:expandedDatabaseIds', val: string[]): void;
  (e: 'selectServer', name: string): void;
  (e: 'selectDatabase', serverName: string, db: string): void;
  (e: 'selectTable', serverName: string, db: string, table: string): void;
  (e: 'expandServer', serverName: string): void;
  (e: 'expandDatabase', serverName: string, db: string): void;
  (e: 'refreshServer', serverName: string): void;
  (e: 'configServer', serverName: string): void;
  (e: 'resizeMouseDown', event: MouseEvent): void;
  (e: 'openConnection'): void;
}>();

const contextMenu = ref<{ x: number, y: number, serverName: string } | null>(null);
const treeRef = ref<HTMLElement | null>(null);

const selectionType = computed(() => {
  if (props.selectedTable) return 'table';
  if (props.selectedDatabase) return 'database';
  if (props.selectedServerName) return 'server';
  return null;
});

const handleToggleServer = (serverName: string, open: boolean) => {
  const newVal = open
    ? [...props.expandedServerNames, serverName]
    : props.expandedServerNames.filter(name => name !== serverName);
  emit('update:expandedServerNames', newVal);
};

const handleToggleDatabase = (serverName: string, dbName: string, open: boolean) => {
  const key = `${serverName}:${dbName}`;
  const newVal = open
    ? [...props.expandedDatabaseIds, key]
    : props.expandedDatabaseIds.filter(k => k !== key);
  emit('update:expandedDatabaseIds', newVal);
};

const handleContextMenu = (e: MouseEvent, serverName: string) => {
  contextMenu.value = { x: e.clientX, y: e.clientY, serverName };
};

const getLoadingDatabasesForServer = (serverName: string) => {
  return props.loadingDatabases
    .filter(ld => ld.startsWith(`${serverName}:`))
    .map(ld => ld.split(':')[1] || '');
};

const getExpandedDatabaseIdsForServer = (serverName: string) => {
  return props.expandedDatabaseIds
    .filter(ed => ed.startsWith(`${serverName}:`))
    .map(ed => ed.split(':')[1] || '');
};

const focusTree = () => treeRef.value?.focus();

const handleSelectServer = (name: string) => { emit('selectServer', name); focusTree(); };
const handleSelectDatabase = (serverName: string, db: string) => { emit('selectDatabase', serverName, db); focusTree(); };
const handleSelectTable = (serverName: string, db: string, table: string) => { emit('selectTable', serverName, db, table); focusTree(); };

// Flat list of all visible items for arrow key navigation
type VisibleItem =
  | { type: 'server'; serverName: string }
  | { type: 'database'; serverName: string; dbName: string }
  | { type: 'table'; serverName: string; dbName: string; tableName: string };

const visibleItems = computed<VisibleItem[]>(() => {
  const result: VisibleItem[] = [];
  for (const server of props.servers) {
    const serverDbs: DatabaseInfo[] = server.databases || [];
    const filteredDbs = serverDbs.filter((db: DatabaseInfo) => {
      const isSelected = server.name === props.selectedServerName && db.name === props.selectedDatabase;
      if (isSelected) return true;
      if (props.dbFilter && !db.name.toLowerCase().includes(props.dbFilter.toLowerCase())) return false;
      if (props.tableFilter && (db.tables || []).length > 0) {
        if (!(db.tables || []).some((t: TableInfo) => t.name.toLowerCase().includes(props.tableFilter.toLowerCase()))) return false;
      }
      return true;
    });
    if (props.dbFilter && filteredDbs.length === 0 && serverDbs.length > 0) continue;

    result.push({ type: 'server', serverName: server.name });

    if (!props.expandedServerNames.includes(server.name)) continue;

    const expandedDbIds = getExpandedDatabaseIdsForServer(server.name);
    for (const db of filteredDbs) {
      result.push({ type: 'database', serverName: server.name, dbName: db.name });

      if (!expandedDbIds.includes(db.name)) continue;

      const tables: TableInfo[] = (db.tables || []).filter((t: TableInfo) => {
        if (server.name === props.selectedServerName && db.name === props.selectedDatabase && t.name === props.selectedTable) return true;
        return !props.tableFilter || t.name.toLowerCase().includes(props.tableFilter.toLowerCase());
      });
      for (const t of tables) {
        result.push({ type: 'table', serverName: server.name, dbName: db.name, tableName: t.name });
      }
    }
  }
  return result;
});

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = visibleItems.value;
  if (items.length === 0) return;

  const current = items.findIndex(item => {
    if (item.type === 'server') return selectionType.value === 'server' && item.serverName === props.selectedServerName;
    if (item.type === 'database') return selectionType.value === 'database' && item.serverName === props.selectedServerName && item.dbName === props.selectedDatabase;
    return selectionType.value === 'table' && item.serverName === props.selectedServerName && item.dbName === props.selectedDatabase && item.tableName === props.selectedTable;
  });

  const next = e.key === 'ArrowDown'
    ? (current < items.length - 1 ? current + 1 : 0)
    : (current > 0 ? current - 1 : items.length - 1);

  const target = items[next];
  if (target.type === 'server') emit('selectServer', target.serverName);
  else if (target.type === 'database') emit('selectDatabase', target.serverName, target.dbName);
  else emit('selectTable', target.serverName, target.dbName, target.tableName);
};

</script>

<template>
  <div
    class="bg-slate-100 dark:bg-slate-900 flex flex-col border-r border-slate-200 dark:border-slate-700 select-none relative overflow-x-hidden flex-shrink-0"
    style="width: var(--sidebar-width, 256px)"
  >
    <div class="p-4 space-y-3 border-b border-slate-200 dark:border-slate-700">
      <div class="relative">
        <Search class="absolute left-2 top-2.5 text-slate-400 dark:text-slate-500" :size="16" />
        <input
          type="text"
          :placeholder="$t('sidebar.search_db')"
          class="w-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-200 pl-8 pr-2 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          :value="dbFilter"
          @input="emit('update:dbFilter', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="relative">
        <Search class="absolute left-2 top-2.5 text-slate-400 dark:text-slate-500" :size="16" />
        <input
          type="text"
          :placeholder="$t('sidebar.search_table')"
          class="w-full bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-200 pl-8 pr-2 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          :value="tableFilter"
          @input="emit('update:tableFilter', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div
      ref="treeRef"
      tabindex="0"
      class="flex-1 overflow-y-auto overflow-x-hidden py-2 flex flex-col outline-none"
      @keydown="handleKeyDown"
    >
      <div v-if="servers.length === 0" class="flex-1 flex flex-col items-center justify-center px-4 space-y-4">
        <p class="text-sm text-slate-400 dark:text-slate-500 italic">{{ $t('sidebar.no_connections') }}</p>
        <button
          @click="emit('openConnection')"
          class="w-full py-2 px-4 bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-600/30 rounded text-sm flex items-center justify-center gap-2 group"
        >
          <Server :size="14" class="group-hover:scale-110" />
          <span>{{ $t('sidebar.open_connection') }}</span>
        </button>
      </div>
      <template v-else>
        <ServerItem
          v-for="server in servers"
          :key="server.name"
          :name="server.name"
          :type="server.type"
          :databases="(server.databases || []).map((db: any) => ({
            name: db.name,
            size: db.size,
            tables: (db.tables || []).map((t: any) => ({
              name: t.name,
              size: t.size
            }))
          }))"
          :filterDatabase="dbFilter"
          :filterTable="tableFilter"
          :isSelected="selectionType === 'server' && selectedServerName === server.name"
          :isActive="selectedServerName === server.name"
          :selectedDatabase="selectedServerName === server.name ? selectedDatabase : null"
          :selectedTable="selectedServerName === server.name ? selectedTable : null"
          :isOpen="expandedServerNames.includes(server.name)"
          :isLoading="loadingServers.includes(server.name)"
          :loadingDatabases="getLoadingDatabasesForServer(server.name)"
          :expandedDatabaseIds="getExpandedDatabaseIdsForServer(server.name)"
          @toggle="(open) => handleToggleServer(server.name, open)"
          @select="handleSelectServer(server.name)"
          @selectDatabase="(db) => handleSelectDatabase(server.name, db)"
          @selectTable="(dbName, table) => handleSelectTable(server.name, dbName, table)"
          @expand="emit('expandServer', server.name)"
          @expandDatabase="(db) => emit('expandDatabase', server.name, db)"
          @refresh="emit('refreshServer', server.name)"
          @contextMenu="handleContextMenu"
          @toggleDatabase="(db, open) => handleToggleDatabase(server.name, db, open)"
        />
      </template>
    </div>

    <ContextMenu
      v-if="contextMenu"
      :x="contextMenu.x"
      :y="contextMenu.y"
      @close="contextMenu = null"
      @config="emit('configServer', contextMenu.serverName)"
    />

    <div class="p-4 bg-slate-200 dark:bg-slate-950 text-xs text-slate-500 dark:text-slate-500 border-t border-slate-300 dark:border-slate-800">
      {{ APP_VERSION }}
    </div>

    <!-- Resize Handle -->
    <div
      class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500 dark:hover:bg-blue-500/50 z-10"
      @mousedown="emit('resizeMouseDown', $event)"
    />
  </div>
</template>
