<script setup lang="ts">
import { ref } from 'vue';
import { Search, Server } from 'lucide-vue-next';
import ContextMenu from './Sidebar/ContextMenu.vue';
import ServerItem from './Sidebar/ServerItem.vue';
import { $t } from '../i18n';

const props = defineProps<{
  servers: any[];
  selectedServerName: string | null;
  selectedDatabase: string | null;
  selectedTable: string | null;
  loadingServers: string[];
  loadingDatabases: string[];
  loadingTables: string[];
  dbFilter: string;
  tableFilter: string;
  expandedServerNames: string[];
  expandedDatabaseIds: string[];
  expandedTableIds: string[];
}>();

const emit = defineEmits<{
  (e: 'update:dbFilter', val: string): void;
  (e: 'update:tableFilter', val: string): void;
  (e: 'update:expandedServerNames', val: string[]): void;
  (e: 'update:expandedDatabaseIds', val: string[]): void;
  (e: 'update:expandedTableIds', val: string[]): void;
  (e: 'selectServer', name: string): void;
  (e: 'selectDatabase', serverName: string, db: string): void;
  (e: 'selectTable', serverName: string, db: string, table: string): void;
  (e: 'expandServer', serverName: string): void;
  (e: 'expandDatabase', serverName: string, db: string): void;
  (e: 'expandTable', serverName: string, db: string, table: string): void;
  (e: 'configServer', serverName: string): void;
  (e: 'resizeMouseDown', event: MouseEvent): void;
  (e: 'openConnection'): void;
}>();

const contextMenu = ref<{ x: number, y: number, serverName: string } | null>(null);

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

const handleToggleTable = (serverName: string, dbName: string, tableName: string, open: boolean) => {
  const key = `${serverName}:${dbName}:${tableName}`;
  const newVal = open 
    ? [...props.expandedTableIds, key] 
    : props.expandedTableIds.filter(k => k !== key);
  emit('update:expandedTableIds', newVal);
};

const handleContextMenu = (e: MouseEvent, serverName: string) => {
  contextMenu.value = { x: e.clientX, y: e.clientY, serverName };
};

const getLoadingDatabasesForServer = (serverName: string) => {
  return props.loadingDatabases
    .filter(ld => ld.startsWith(`${serverName}:`))
    .map(ld => ld.split(':')[1] || '');
};

const getLoadingTablesForServer = (serverName: string) => {
  return props.loadingTables
    .filter(lt => lt.startsWith(`${serverName}:`))
    .map(lt => {
      const parts = lt.split(':');
      return `${parts[1]}:${parts[2]}`;
    });
};

const getExpandedDatabaseIdsForServer = (serverName: string) => {
  return props.expandedDatabaseIds
    .filter(ed => ed.startsWith(`${serverName}:`))
    .map(ed => ed.split(':')[1] || '');
};

const getExpandedTableIdsForServer = (serverName: string) => {
  return props.expandedTableIds
    .filter(et => et.startsWith(`${serverName}:`))
    .map(et => {
      const parts = et.split(':');
      return `${parts[1]}:${parts[2]}`;
    });
};
</script>

<template>
  <div 
    class="h-screen bg-slate-900 flex flex-col border-r border-slate-700 select-none relative overflow-x-hidden flex-shrink-0"
    style="width: var(--sidebar-width, 256px)"
  >
    <div class="p-4 space-y-3 border-b border-slate-700">
      <div class="relative">
        <Search class="absolute left-2 top-2.5 text-slate-500" :size="16" />
        <input 
          type="text" 
          :placeholder="$t('sidebar.search_db')" 
          class="w-full bg-slate-800 text-slate-200 pl-8 pr-2 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          :value="dbFilter"
          @input="emit('update:dbFilter', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="relative">
        <Search class="absolute left-2 top-2.5 text-slate-500" :size="16" />
        <input 
          type="text" 
          :placeholder="$t('sidebar.search_table')" 
          class="w-full bg-slate-800 text-slate-200 pl-8 pr-2 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          :value="tableFilter"
          @input="emit('update:tableFilter', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto overflow-x-hidden py-2 flex flex-col">
      <div v-if="servers.length === 0" class="flex-1 flex flex-col items-center justify-center px-4 space-y-4">
        <p class="text-sm text-slate-500 italic">{{ $t('sidebar.no_connections') }}</p>
        <button 
          @click="emit('openConnection')"
          class="w-full py-2 px-4 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded text-sm flex items-center justify-center gap-2 group"
        >
          <Server :size="14" class="group-hover:scale-110" />
          <span>{{ $t('sidebar.open_connection') }}</span>
        </button>
      </div>
      <template v-else>
        <ServerItem 
          v-for="server in servers"
          :key="server.name"
          v-memo="[server.name, server.type, server.databases, dbFilter, tableFilter, selectedServerName === server.name, selectedServerName === server.name ? selectedDatabase : null, selectedServerName === server.name ? selectedTable : null, expandedServerNames.includes(server.name), loadingServers.includes(server.name), getLoadingDatabasesForServer(server.name), getLoadingTablesForServer(server.name), getExpandedDatabaseIdsForServer(server.name), getExpandedTableIdsForServer(server.name)]"
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
          :isSelected="selectedServerName === server.name"
          :selectedDatabase="selectedServerName === server.name ? selectedDatabase : null"
          :selectedTable="selectedServerName === server.name ? selectedTable : null"
          :isOpen="expandedServerNames.includes(server.name)"
          :isLoading="loadingServers.includes(server.name)"
          :loadingDatabases="getLoadingDatabasesForServer(server.name)"
          :loadingTables="getLoadingTablesForServer(server.name)"
          :expandedDatabaseIds="getExpandedDatabaseIdsForServer(server.name)"
          :expandedTableIds="getExpandedTableIdsForServer(server.name)"
          @toggle="(open) => handleToggleServer(server.name, open)"
          @select="emit('selectServer', server.name)"
          @selectDatabase="(db) => emit('selectDatabase', server.name, db)"
          @selectTable="(dbName, table) => emit('selectTable', server.name, dbName, table)"
          @expand="emit('expandServer', server.name)"
          @expandDatabase="(db) => emit('expandDatabase', server.name, db)"
          @expandTable="(db, table) => emit('expandTable', server.name, db, table)"
          @contextMenu="handleContextMenu"
          @toggleDatabase="(db, open) => handleToggleDatabase(server.name, db, open)"
          @toggleTable="(db, table, open) => handleToggleTable(server.name, db, table, open)"
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
    
    <div class="p-4 bg-slate-950 text-xs text-slate-500 border-t border-slate-800">
      {{ $t('sidebar.version') }}
    </div>

    <!-- Resize Handle -->
    <div 
      class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 z-10"
      @mousedown="emit('resizeMouseDown', $event)"
    />
  </div>
</template>
