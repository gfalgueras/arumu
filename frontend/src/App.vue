<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { Plus, X } from 'lucide-vue-next';
import Sidebar from './components/Sidebar.vue';
import TopBar from './components/TopBar.vue';
import ConnectionModal from './components/ConnectionModal.vue';
import DataTable from './components/DataTable.vue';
import QueryEditor from './components/QueryEditor.vue';
import type { ServerInfo, StoredServer } from '@shared/types/database';

const servers = ref<ServerInfo[]>([]);
const selectedServerId = ref<string | null>(null);
const selectedDatabase = ref<string | null>(null);
const selectedTable = ref<string | null>(null);

interface QueryTab {
  id: string;
  name: string;
  query: string;
}

const queryTabs = ref<QueryTab[]>([
  { id: '1', name: 'Query 1', query: '' }
]);
const activeTab = ref<string>('1');
const editingTabId = ref<string | null>(null);
const editTabNameValue = ref('');

const vFocus = {
  mounted: (el: HTMLElement) => el.focus()
};
const isModalOpen = ref(false);
const editingServer = ref<StoredServer | undefined>(undefined);
const loadingServers = ref<string[]>([]);
const loadingDatabases = ref<string[]>([]);
const sidebarWidth = ref(256);
const isResizing = ref(false);
const dbFilter = ref('');
const tableFilter = ref('');
const expandedServerIds = ref<string[]>([]);
const expandedDatabaseIds = ref<string[]>([]);

const fetchServers = async () => {
  const res = await fetch('http://localhost:3001/api/servers');
  const data = await res.json();
  servers.value = data;
};

const handleExpandServer = async (serverId: string) => {
  if (loadingServers.value.includes(serverId)) return;
  
  loadingServers.value.push(serverId);
  try {
    const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(serverId)}/databases`);
    const databases = await res.json();
    
    servers.value = servers.value.map(s => 
      s.id === serverId ? { ...s, databases } : s
    );
  } catch (error) {
    console.error('Error fetching databases:', error);
  } finally {
    loadingServers.value = loadingServers.value.filter(id => id !== serverId);
  }
};

const handleExpandDatabase = async (serverId: string, dbName: string) => {
  const key = `${serverId}:${dbName}`;
  if (loadingDatabases.value.includes(key)) return;

  loadingDatabases.value.push(key);
  try {
    const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(serverId)}/databases/${encodeURIComponent(dbName)}/tables`);
    const tables = await res.json();

    servers.value = servers.value.map(s => {
      if (s.id === serverId) {
        const updatedDbs = s.databases?.map(db => 
          db.name === dbName ? { 
            ...db, 
            tables, 
            size: tables.reduce((acc: number, t: any) => acc + (t.size || 0), 0) 
          } : db
        );
        return { ...s, databases: updatedDbs };
      }
      return s;
    });
  } catch (error) {
    console.error('Error fetching tables:', error);
  } finally {
    loadingDatabases.value = loadingDatabases.value.filter(k => k !== key);
  }
};

const handleConnect = async (storedServer: StoredServer, closeAndRefresh = true) => {
  const res = await fetch('http://localhost:3001/api/servers/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(storedServer),
  });
  if (res.ok && closeAndRefresh) {
    await fetchServers();
    isModalOpen.value = false;
    editingServer.value = null;

    selectedServerId.value = storedServer.id;
    selectedDatabase.value = null;
    selectedTable.value = null;
    activeTab.value = 'query';

    if (!expandedServerIds.value.includes(storedServer.id)) {
      expandedServerIds.value.push(storedServer.id);
    }
    handleExpandServer(storedServer.id);
  }
};

const initApp = async () => {
  const storedRes = await fetch('http://localhost:3001/api/stored-servers');
  const storedServers: StoredServer[] = await storedRes.json();

  const stateRes = await fetch('http://localhost:3001/api/app-state');
  const state = await stateRes.json();

  if (state) {
    if (state.activeServerIds && state.activeServerIds.length > 0) {
      for (const serverId of state.activeServerIds) {
        const serverToConnect = storedServers.find(s => s.id === serverId);
        if (serverToConnect) {
          await handleConnect(serverToConnect, false);
        }
      }
    }

    sidebarWidth.value = state.sidebarWidth || 256;
    dbFilter.value = state.dbFilter || '';
    tableFilter.value = state.tableFilter || '';
    selectedServerId.value = state.selectedServerId;
    selectedDatabase.value = state.selectedDatabase;
    selectedTable.value = state.selectedTable;
    if (state.queryTabs && state.queryTabs.length > 0) {
      queryTabs.value = state.queryTabs;
    }
    activeTab.value = state.activeTab || queryTabs.value[0].id;
    
    // Validar que la pestaña activa existe
    if (activeTab.value !== 'data' && !queryTabs.value.find(t => t.id === activeTab.value)) {
      activeTab.value = queryTabs.value[0].id;
    }
    expandedServerIds.value = state.expandedServerIds || [];
    expandedDatabaseIds.value = state.expandedDatabaseIds || [];
  }

  await fetchServers();

  if (state) {
    if (state.expandedServerIds) {
      for (const sId of state.expandedServerIds) {
        handleExpandServer(sId);
      }
    }
    if (state.expandedDatabaseIds) {
      for (const dbId of state.expandedDatabaseIds) {
        const [sId, dbName] = dbId.split(':');
        if (sId && dbName) {
          handleExpandDatabase(sId, dbName);
        }
      }
    }
  }
};

onMounted(() => {
  initApp();
  document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth.value}px`);
});

watch([servers, selectedServerId, selectedDatabase, selectedTable, activeTab, sidebarWidth, dbFilter, tableFilter, expandedServerIds, expandedDatabaseIds, queryTabs], (_, __, onCleanup) => {
  const saveState = async () => {
    const state = {
      activeServerIds: servers.value.map(s => s.id),
      selectedServerId: selectedServerId.value,
      selectedDatabase: selectedDatabase.value,
      selectedTable: selectedTable.value,
      activeTab: activeTab.value,
      queryTabs: queryTabs.value,
      sidebarWidth: sidebarWidth.value,
      dbFilter: dbFilter.value,
      tableFilter: tableFilter.value,
      expandedServerIds: expandedServerIds.value,
      expandedDatabaseIds: expandedDatabaseIds.value
    };

    try {
      await fetch('http://localhost:3001/api/app-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
    } catch (error) {
      console.error('Error saving app state:', error);
    }
  };

  const timer = setTimeout(saveState, 1000);
  onCleanup(() => clearTimeout(timer));
}, { deep: true });

const handleMouseMove = (e: MouseEvent) => {
  if (!isResizing.value) return;
  
  let newWidth = e.clientX;
  const minWidth = window.innerWidth * 0.05;
  const maxWidth = window.innerWidth * 0.20;
  
  if (newWidth < minWidth) newWidth = minWidth;
  if (newWidth > maxWidth) newWidth = maxWidth;
  
  document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
  sidebarWidth.value = newWidth;
};

const handleMouseUp = () => {
  isResizing.value = false;
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('mouseup', handleMouseUp);
};

const handleMouseDown = (e: MouseEvent) => {
  e.preventDefault();
  isResizing.value = true;
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
};

const handleCloseConnection = async () => {
  if (!selectedServerId.value) return;
  try {
    const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(selectedServerId.value)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      servers.value = servers.value.filter(s => s.id !== selectedServerId.value);
      selectedServerId.value = null;
      selectedDatabase.value = null;
      selectedTable.value = null;
    } else {
      const errorData = await res.json();
      alert('Error closing connection: ' + (errorData.error || 'Unknown error'));
    }
  } catch (error: any) {
    console.error('Error closing connection:', error);
    alert('Error closing connection: ' + error.message);
  }
};

const handleConfigServer = async (serverId: string) => {
  try {
    const res = await fetch('http://localhost:3001/api/stored-servers');
    const storedServers: StoredServer[] = await res.json();
    const serverToEdit = storedServers.find(s => s.id === serverId);
    if (serverToEdit) {
      editingServer.value = serverToEdit;
      isModalOpen.value = true;
    } else {
      alert('No se pudo encontrar la configuración guardada para este servidor.');
    }
  } catch (error) {
    console.error('Error fetching server config:', error);
  }
};

const lastActiveQueryTabId = ref<string>('1');

watch(activeTab, (newVal) => {
  if (newVal !== 'data') {
    lastActiveQueryTabId.value = newVal;
  }
});

const addQueryTab = () => {
  const newId = Date.now().toString();
  queryTabs.value.push({
    id: newId,
    name: `Query ${queryTabs.value.length + 1}`,
    query: ''
  });
  activeTab.value = newId;
};

const startEditingTabName = (tab: QueryTab) => {
  editingTabId.value = tab.id;
  editTabNameValue.value = tab.name;
};

const saveTabName = () => {
  if (editingTabId.value) {
    const tab = queryTabs.value.find(t => t.id === editingTabId.value);
    if (tab && editTabNameValue.value.trim()) {
      tab.name = editTabNameValue.value.trim();
    }
  }
  editingTabId.value = null;
};

const removeQueryTab = (id: string) => {
  if (queryTabs.value.length <= 1) return;
  const index = queryTabs.value.findIndex(t => t.id === id);
  queryTabs.value = queryTabs.value.filter(t => t.id !== id);
  if (activeTab.value === id) {
    activeTab.value = queryTabs.value[Math.max(0, index - 1)].id;
  }
};

const selectServer = (id: string) => {
  selectedServerId.value = id;
  selectedDatabase.value = null;
  selectedTable.value = null;
  if (activeTab.value === 'data') {
    activeTab.value = lastActiveQueryTabId.value;
  }
};

const selectDatabase = (serverId: string, db: string) => {
  selectedServerId.value = serverId;
  selectedDatabase.value = db;
  selectedTable.value = null;
  if (activeTab.value === 'data') {
    activeTab.value = lastActiveQueryTabId.value;
  }
};

const selectTable = (serverId: string, db: string, table: string) => {
  selectedServerId.value = serverId;
  selectedDatabase.value = db;
  selectedTable.value = table;
  activeTab.value = 'data';
};
</script>

<template>
  <div class="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden" :class="isResizing ? 'cursor-col-resize select-none' : ''">
    <Sidebar 
      :servers="servers"
      :selectedServerId="selectedServerId"
      :selectedDatabase="selectedDatabase"
      :selectedTable="selectedTable"
      v-model:dbFilter="dbFilter"
      v-model:tableFilter="tableFilter"
      v-model:expandedServerIds="expandedServerIds"
      v-model:expandedDatabaseIds="expandedDatabaseIds"
      @selectServer="selectServer"
      @selectDatabase="selectDatabase"
      @selectTable="selectTable"
      @expandServer="handleExpandServer"
      @expandDatabase="handleExpandDatabase"
      @configServer="handleConfigServer"
      :loadingServers="loadingServers"
      :loadingDatabases="loadingDatabases"
      @resizeMouseDown="handleMouseDown"
      @openConnection="isModalOpen = true"
    />
    <div class="flex-1 flex flex-col min-w-0">
      <TopBar 
        @openConnection="isModalOpen = true"
        @closeConnection="handleCloseConnection"
        :canClose="!!selectedServerId"
      />
      <main class="flex-1 flex flex-col p-4 overflow-hidden min-w-0">
        <div v-if="selectedServerId" class="w-full h-full flex flex-col min-h-0 min-w-0">
          <!-- Tabs Header -->
          <div class="flex border-b border-slate-800 mb-4 flex-shrink-0 items-center overflow-x-auto scrollbar-none">
            <button 
              v-if="selectedTable"
              @click="activeTab = 'data'"
              class="px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors"
              :class="activeTab === 'data' ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'"
            >
              Datos
            </button>
            <div 
              v-for="tab in queryTabs" 
              :key="tab.id"
              class="group relative flex items-center border-b-2 transition-colors"
              :class="(activeTab === tab.id || editingTabId === tab.id) ? 'border-blue-500 bg-blue-500/5' : 'border-transparent hover:bg-slate-800/50'"
            >
              <button 
                v-if="editingTabId !== tab.id"
                @click="activeTab = tab.id"
                @dblclick="startEditingTabName(tab)"
                class="pl-4 pr-2 py-2 text-sm font-medium whitespace-nowrap"
                :class="activeTab === tab.id ? 'text-blue-500' : 'text-slate-400 hover:text-slate-200'"
              >
                {{ tab.name }}
              </button>
              <input
                v-else
                v-model="editTabNameValue"
                @blur="saveTabName"
                @keyup.enter="saveTabName"
                @keyup.escape="editingTabId = null"
                v-focus
                class="px-4 py-2 text-sm font-medium bg-slate-800 text-blue-500 outline-none w-32"
              />
              <button 
                v-if="queryTabs.length > 1"
                @click.stop="removeQueryTab(tab.id)"
                class="mr-1.5 p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700/50 rounded transition-all opacity-0 group-hover:opacity-100"
                title="Cerrar pestaña"
              >
                <X :size="14" />
              </button>
            </div>
            <button 
              @click="addQueryTab"
              class="px-4 py-2 text-slate-400 hover:text-blue-500 hover:bg-slate-800/50 transition-colors border-b-2 border-transparent"
              title="Nueva pestaña de consulta"
            >
              <Plus :size="18" />
            </button>
          </div>

          <!-- Tab Content -->
          <div class="flex-1 min-h-0 flex flex-col min-w-0">
            <KeepAlive>
              <DataTable 
                v-if="activeTab === 'data' && selectedTable && selectedServerId && selectedDatabase"
                :key="`${selectedServerId}:${selectedDatabase}:${selectedTable}`"
                :serverId="selectedServerId"
                :database="selectedDatabase"
                :table="selectedTable"
              />
            </KeepAlive>
            <KeepAlive>
              <QueryEditor 
                v-if="activeTab !== 'data'"
                :key="activeTab"
                :serverId="selectedServerId!"
                :database="selectedDatabase"
                v-model="queryTabs.find(t => t.id === activeTab)!.query"
              />
            </KeepAlive>
          </div>
        </div>
        <div v-else class="flex-1 flex flex-col items-center justify-center">
          <div class="max-w-2xl text-center space-y-4">
            <h1 class="text-4xl font-bold text-blue-500">SQL Manager</h1>
            <p class="text-slate-400 text-lg">
              Select a server, database and table from the sidebar to start managing your data.
            </p>
            <div class="grid grid-cols-2 gap-4 mt-8 mx-auto">
              <div class="p-6 bg-slate-900 rounded-lg border border-slate-800 text-left">
                <h3 class="font-semibold text-blue-400 mb-2">Modular Backend</h3>
                <p class="text-sm text-slate-500">Ready for MySQL, PostgreSQL, and SQLite.</p>
              </div>
              <div class="p-6 bg-slate-900 rounded-lg border border-slate-800 text-left">
                <h3 class="font-semibold text-blue-400 mb-2">Modern UI</h3>
                <p class="text-sm text-slate-500">Built with Vue, Tailwind CSS and Lucide icons.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <ConnectionModal 
      v-if="isModalOpen"
      @close="isModalOpen = false; editingServer = null"
      @connect="handleConnect"
      :editServer="editingServer"
    />
  </div>
</template>
