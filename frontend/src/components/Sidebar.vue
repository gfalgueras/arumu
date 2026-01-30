<script setup lang="ts">
import { ref } from 'vue';
import { Search, Server } from 'lucide-vue-next';
import ContextMenu from './Sidebar/ContextMenu.vue';
import ServerItem from './Sidebar/ServerItem.vue';

const props = defineProps<{
  servers: any[];
  selectedServerId: string | null;
  selectedDatabase: string | null;
  selectedTable: string | null;
  loadingServers: string[];
  loadingDatabases: string[];
  dbFilter: string;
  tableFilter: string;
  expandedServerIds: string[];
  expandedDatabaseIds: string[];
}>();

const emit = defineEmits<{
  (e: 'update:dbFilter', val: string): void;
  (e: 'update:tableFilter', val: string): void;
  (e: 'update:expandedServerIds', val: string[]): void;
  (e: 'update:expandedDatabaseIds', val: string[]): void;
  (e: 'selectServer', id: string): void;
  (e: 'selectDatabase', serverId: string, db: string): void;
  (e: 'selectTable', serverId: string, db: string, table: string): void;
  (e: 'expandServer', serverId: string): void;
  (e: 'expandDatabase', serverId: string, db: string): void;
  (e: 'configServer', serverId: string): void;
  (e: 'resizeMouseDown', event: MouseEvent): void;
  (e: 'openConnection'): void;
}>();

const contextMenu = ref<{ x: number, y: number, serverId: string } | null>(null);

const handleToggleServer = (serverId: string, open: boolean) => {
  const newVal = open 
    ? [...props.expandedServerIds, serverId] 
    : props.expandedServerIds.filter(id => id !== serverId);
  emit('update:expandedServerIds', newVal);
};

const handleToggleDatabase = (serverId: string, dbName: string, open: boolean) => {
  const key = `${serverId}:${dbName}`;
  const newVal = open 
    ? [...props.expandedDatabaseIds, key] 
    : props.expandedDatabaseIds.filter(k => k !== key);
  emit('update:expandedDatabaseIds', newVal);
};

const handleContextMenu = (e: MouseEvent, serverId: string) => {
  contextMenu.value = { x: e.clientX, y: e.clientY, serverId };
};

const getLoadingDatabasesForServer = (serverId: string) => {
  return props.loadingDatabases
    .filter(ld => ld.startsWith(`${serverId}:`))
    .map(ld => ld.split(':')[1] || '');
};

const getExpandedDatabaseIdsForServer = (serverId: string) => {
  return props.expandedDatabaseIds
    .filter(ed => ed.startsWith(`${serverId}:`))
    .map(ed => ed.split(':')[1] || '');
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
          placeholder="Search database..." 
          class="w-full bg-slate-800 text-slate-200 pl-8 pr-2 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          :value="dbFilter"
          @input="emit('update:dbFilter', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <div class="relative">
        <Search class="absolute left-2 top-2.5 text-slate-500" :size="16" />
        <input 
          type="text" 
          placeholder="Search table..." 
          class="w-full bg-slate-800 text-slate-200 pl-8 pr-2 py-2 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          :value="tableFilter"
          @input="emit('update:tableFilter', ($event.target as HTMLInputElement).value)"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto overflow-x-hidden py-2 flex flex-col">
      <div v-if="servers.length === 0" class="flex-1 flex flex-col items-center justify-center px-4 space-y-4">
        <p class="text-sm text-slate-500 italic">No connections active</p>
        <button 
          @click="emit('openConnection')"
          class="w-full py-2 px-4 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded text-sm flex items-center justify-center gap-2 group"
        >
          <Server :size="14" class="group-hover:scale-110" />
          <span>Open Connection</span>
        </button>
      </div>
      <template v-else>
        <ServerItem 
          v-for="server in servers"
          :key="server.id"
          :id="server.id"
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
          :isSelected="selectedServerId === server.id"
          :selectedDatabase="selectedServerId === server.id ? selectedDatabase : null"
          :selectedTable="selectedServerId === server.id ? selectedTable : null"
          :isOpen="expandedServerIds.includes(server.id)"
          :isLoading="loadingServers.includes(server.id)"
          :loadingDatabases="getLoadingDatabasesForServer(server.id)"
          :expandedDatabaseIds="getExpandedDatabaseIdsForServer(server.id)"
          @toggle="(open) => handleToggleServer(server.id, open)"
          @select="emit('selectServer', server.id)"
          @selectDatabase="(db) => emit('selectDatabase', server.id, db)"
          @selectTable="(dbName, table) => emit('selectTable', server.id, dbName, table)"
          @expand="emit('expandServer', server.id)"
          @expandDatabase="(db) => emit('expandDatabase', server.id, db)"
          @contextMenu="handleContextMenu"
          @toggleDatabase="(db, open) => handleToggleDatabase(server.id, db, open)"
        />
      </template>
    </div>
    
    <ContextMenu 
      v-if="contextMenu"
      :x="contextMenu.x" 
      :y="contextMenu.y" 
      @close="contextMenu = null"
      @config="emit('configServer', contextMenu.serverId)"
    />
    
    <div class="p-4 bg-slate-950 text-xs text-slate-500 border-t border-slate-800">
      SQL Manager v1.0.0
    </div>

    <!-- Resize Handle -->
    <div 
      class="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-500/50 z-10"
      @mousedown="emit('resizeMouseDown', $event)"
    />
  </div>
</template>
