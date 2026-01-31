<script setup lang="ts">
import { ref, onMounted, watch, computed, shallowRef } from 'vue';
import { Plus, X } from 'lucide-vue-next';
import Sidebar from './components/Sidebar.vue';
import TopBar from './components/TopBar.vue';
import ConnectionModal from './components/ConnectionModal.vue';
import ErrorModal from './components/ErrorModal.vue';
import DataTable from './components/DataTable.vue';
import TableSchema from './components/TableSchema.vue';
import QueryEditor from './components/QueryEditor.vue';
import { showError } from './errorService';
import type { ServerInfo, StoredServer } from '@shared/types/database';

const servers = shallowRef<ServerInfo[]>([]);
const selectedServerName = ref<string | null>(null);
const selectedDatabase = ref<string | null>(null);
const selectedTable = ref<string | null>(null);

const activeServerNames = computed(() => servers.value.map(s => s.name));

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
const expandedServerNames = ref<string[]>([]);
const expandedDatabaseIds = ref<string[]>([]);
const expandedTableIds = ref<string[]>([]);
const loadingTables = ref<string[]>([]);
const queryEditorHeight = ref(300);
const tableSchemaHeight = ref(400);

const fetchServers = async () => {
  const res = await fetch('http://localhost:3001/api/servers');
  const data = await res.json();
  servers.value = data;
};

const handleExpandServer = async (serverName: string) => {
  if (loadingServers.value.includes(serverName)) return;
  
  loadingServers.value.push(serverName);
  try {
    const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(serverName)}/databases`);
    const databases = await res.json();
    
    servers.value = servers.value.map(s => 
      s.name === serverName ? { ...s, databases } : s
    );
  } catch (error: any) {
    console.error('Error fetching databases:', error);
    showError('Error al listar bases de datos', error.message);
  } finally {
    loadingServers.value = loadingServers.value.filter(id => id !== serverName);
  }
};

const handleExpandDatabase = async (serverName: string, dbName: string) => {
  const key = `${serverName}:${dbName}`;
  if (loadingDatabases.value.includes(key)) return;

  loadingDatabases.value.push(key);
  try {
    const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(serverName)}/databases/${encodeURIComponent(dbName)}/tables`);
    const tables = await res.json();

    servers.value = servers.value.map(s => {
      if (s.name === serverName) {
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
  } catch (error: any) {
    console.error('Error fetching tables:', error);
    showError('Error al listar tablas', error.message);
  } finally {
    loadingDatabases.value = loadingDatabases.value.filter(k => k !== key);
  }
};

const handleExpandTable = async (serverName: string, dbName: string, tableName: string) => {
  const key = `${serverName}:${dbName}:${tableName}`;
  if (loadingTables.value.includes(key)) return;

  loadingTables.value.push(key);
  try {
    const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(serverName)}/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}/columns`);
    const columns = await res.json();

    servers.value = servers.value.map(s => {
      if (s.name === serverName) {
        const updatedDbs = s.databases?.map(db => {
          if (db.name === dbName) {
            const updatedTables = db.tables?.map(t => 
              t.name === tableName ? { ...t, columns } : t
            );
            return { ...db, tables: updatedTables };
          }
          return db;
        });
        return { ...s, databases: updatedDbs };
      }
      return s;
    });
  } catch (error: any) {
    console.error('Error fetching columns:', error);
    showError('Error al listar columnas', error.message);
  } finally {
    loadingTables.value = loadingTables.value.filter(k => k !== key);
  }
};

const handleConnect = async (storedServer: StoredServer, closeAndRefresh = true) => {
  try {
    const res = await fetch('http://localhost:3001/api/servers/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(storedServer),
    });
    
    if (res.ok) {
      if (closeAndRefresh) {
        await fetchServers();
        isModalOpen.value = false;
        editingServer.value = undefined;

        selectedServerName.value = storedServer.name;
        selectedDatabase.value = null;
        selectedTable.value = null;
        
        // Seleccionar la primera pestaña de query disponible
        if (queryTabs.value.length > 0) {
          activeTab.value = queryTabs.value[0].id;
        }

        if (!expandedServerNames.value.includes(storedServer.name)) {
          expandedServerNames.value.push(storedServer.name);
        }
        handleExpandServer(storedServer.name);
      }
    } else {
      const errorData = await res.json();
      showError('Error de conexión', errorData.error || 'Error desconocido');
    }
  } catch (error: any) {
    console.error('Connection error:', error);
    showError('Error de red al conectar', error.message);
  }
};

const initApp = async () => {
  const storedRes = await fetch('http://localhost:3001/api/stored-servers');
  const storedServers: StoredServer[] = await storedRes.json();

  const stateRes = await fetch('http://localhost:3001/api/app-state');
  const state = await stateRes.json();

  if (state) {
    if (state.activeServerNames && state.activeServerNames.length > 0) {
      for (const serverName of state.activeServerNames) {
        const serverToConnect = storedServers.find(s => s.name === serverName);
        if (serverToConnect) {
          await handleConnect(serverToConnect, false);
        }
      }
    }

    sidebarWidth.value = state.sidebarWidth || 256;
    queryEditorHeight.value = state.queryEditorHeight || 300;
    tableSchemaHeight.value = state.tableSchemaHeight || 400;
    dbFilter.value = state.dbFilter || '';
    tableFilter.value = state.tableFilter || '';
    selectedServerName.value = state.selectedServerName;
    selectedDatabase.value = state.selectedDatabase;
    selectedTable.value = state.selectedTable;
    if (state.queryTabs && state.queryTabs.length > 0) {
      queryTabs.value = state.queryTabs;
    }
    activeTab.value = state.activeTab || queryTabs.value[0].id;
    
    // Validar que la pestaña activa existe
    if (activeTab.value !== 'data' && activeTab.value !== 'schema' && !queryTabs.value.find(t => t.id === activeTab.value)) {
      activeTab.value = queryTabs.value[0].id;
    }
    expandedServerNames.value = state.expandedServerNames || [];
    expandedDatabaseIds.value = state.expandedDatabaseIds || [];
    expandedTableIds.value = state.expandedTableIds || [];
  }

  await fetchServers();

  if (state) {
    if (state.expandedServerNames) {
      for (const sName of state.expandedServerNames) {
        handleExpandServer(sName);
      }
    }
    if (state.expandedDatabaseIds) {
      for (const dbId of state.expandedDatabaseIds) {
        const [sName, dbName] = dbId.split(':');
        if (sName && dbName) {
          handleExpandDatabase(sName, dbName);
        }
      }
    }
    if (state.expandedTableIds) {
      for (const tableId of state.expandedTableIds) {
        const [sName, dbName, tableName] = tableId.split(':');
        if (sName && dbName && tableName) {
          handleExpandTable(sName, dbName, tableName);
        }
      }
    }
  }
};

onMounted(() => {
  initApp();
  document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth.value}px`);
});

watch([activeServerNames, selectedServerName, selectedDatabase, selectedTable, activeTab, sidebarWidth, queryEditorHeight, tableSchemaHeight, dbFilter, tableFilter, expandedServerNames, expandedDatabaseIds, expandedTableIds, queryTabs], (_, __, onCleanup) => {
  const saveState = async () => {
    const state = {
      activeServerNames: activeServerNames.value,
      selectedServerName: selectedServerName.value,
      selectedDatabase: selectedDatabase.value,
      selectedTable: selectedTable.value,
      activeTab: activeTab.value,
      queryTabs: queryTabs.value,
      sidebarWidth: sidebarWidth.value,
      queryEditorHeight: queryEditorHeight.value,
      tableSchemaHeight: tableSchemaHeight.value,
      dbFilter: dbFilter.value,
      tableFilter: tableFilter.value,
      expandedServerNames: expandedServerNames.value,
      expandedDatabaseIds: expandedDatabaseIds.value,
      expandedTableIds: expandedTableIds.value
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
  if (!selectedServerName.value) return;
  try {
    const res = await fetch(`http://localhost:3001/api/servers/${encodeURIComponent(selectedServerName.value)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      servers.value = servers.value.filter(s => s.name !== selectedServerName.value);
      selectedServerName.value = null;
      selectedDatabase.value = null;
      selectedTable.value = null;
    } else {
      const errorData = await res.json();
      showError('Error al cerrar conexión', errorData.error || 'Error desconocido');
    }
  } catch (error: any) {
    console.error('Error closing connection:', error);
    showError('Error al cerrar conexión', error.message);
  }
};

const handleConfigServer = async (serverName: string) => {
  try {
    const res = await fetch('http://localhost:3001/api/stored-servers');
    const storedServers: StoredServer[] = await res.json();
    const serverToEdit = storedServers.find(s => s.name === serverName);
    if (serverToEdit) {
      editingServer.value = serverToEdit;
      isModalOpen.value = true;
    } else {
      showError('Configuración no encontrada', 'No se pudo encontrar la configuración guardada para este servidor.');
    }
  } catch (error: any) {
    console.error('Error fetching server config:', error);
    showError('Error al obtener configuración', error.message);
  }
};

const lastActiveQueryTabId = ref<string>('1');

watch(activeTab, (newVal) => {
  if (newVal !== 'data' && newVal !== 'schema') {
    lastActiveQueryTabId.value = newVal;
  }
});

const addQueryTab = () => {
  const newId = Date.now().toString();
  queryTabs.value = [
    ...queryTabs.value,
    {
      id: newId,
      name: `Query ${queryTabs.value.length + 1}`,
      query: ''
    }
  ];
  activeTab.value = newId;
};

const startEditingTabName = (tab: QueryTab) => {
  editingTabId.value = tab.id;
  editTabNameValue.value = tab.name;
};

const saveTabName = () => {
  if (editingTabId.value) {
    queryTabs.value = queryTabs.value.map(t => {
      if (t.id === editingTabId.value) {
        const newName = editTabNameValue.value.trim();
        return newName ? { ...t, name: newName } : t;
      }
      return t;
    });
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

const selectServer = (name: string) => {
  selectedServerName.value = name;
  selectedDatabase.value = null;
  selectedTable.value = null;
  if (activeTab.value === 'data' || activeTab.value === 'schema') {
    activeTab.value = lastActiveQueryTabId.value;
  }
};

const selectedServerType = computed(() => {
  const server = servers.value.find(s => s.name === selectedServerName.value);
  return server?.type || 'mysql';
});

const selectDatabase = (serverName: string, db: string) => {
  selectedServerName.value = serverName;
  selectedDatabase.value = db;
  selectedTable.value = null;
  if (activeTab.value === 'data' || activeTab.value === 'schema') {
    activeTab.value = lastActiveQueryTabId.value;
  }
};

const selectTable = (serverName: string, db: string, table: string) => {
  selectedServerName.value = serverName;
  selectedDatabase.value = db;
  selectedTable.value = table;
  activeTab.value = 'schema';
};
</script>

<template>
  <div class="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden" :class="isResizing ? 'cursor-col-resize select-none' : ''">
    <Sidebar 
      :servers="servers"
      :selectedServerName="selectedServerName"
      :selectedDatabase="selectedDatabase"
      :selectedTable="selectedTable"
      v-model:dbFilter="dbFilter"
      v-model:tableFilter="tableFilter"
      v-model:expandedServerNames="expandedServerNames"
      v-model:expandedDatabaseIds="expandedDatabaseIds"
      v-model:expandedTableIds="expandedTableIds"
      @selectServer="selectServer"
      @selectDatabase="selectDatabase"
      @selectTable="selectTable"
      @expandServer="handleExpandServer"
      @expandDatabase="handleExpandDatabase"
      @expandTable="handleExpandTable"
      @configServer="handleConfigServer"
      :loadingServers="loadingServers"
      :loadingDatabases="loadingDatabases"
      :loadingTables="loadingTables"
      @resizeMouseDown="handleMouseDown"
      @openConnection="isModalOpen = true"
    />
    <div class="flex-1 flex flex-col min-w-0">
      <TopBar 
        @openConnection="isModalOpen = true"
        @closeConnection="handleCloseConnection"
        :canClose="!!selectedServerName"
      />
      <main class="flex-1 flex flex-col p-4 overflow-hidden min-w-0">
        <div v-if="selectedServerName" class="w-full h-full flex flex-col min-h-0 min-w-0">
          <!-- Tabs Header -->
          <div class="flex border-b border-slate-800 mb-4 flex-shrink-0 items-center overflow-x-auto scrollbar-none">
            <button 
              v-if="selectedTable"
              @click="activeTab = 'schema'"
              class="px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors"
              :class="activeTab === 'schema' ? 'border-blue-500 text-blue-500 bg-blue-500/5' : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'"
            >
              Schema
            </button>
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
              v-memo="[tab.id, tab.name, activeTab === tab.id, editingTabId === tab.id]"
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
              <TableSchema 
                v-if="activeTab === 'schema' && selectedTable && selectedServerName && selectedDatabase"
                :key="`schema:${selectedServerName}:${selectedDatabase}:${selectedTable}`"
                :serverName="selectedServerName"
                :database="selectedDatabase"
                :table="selectedTable"
                v-model:height="tableSchemaHeight"
              />
            </KeepAlive>
            <KeepAlive>
              <DataTable 
                v-if="activeTab === 'data' && selectedTable && selectedServerName && selectedDatabase"
                :key="`data:${selectedServerName}:${selectedDatabase}:${selectedTable}`"
                :serverName="selectedServerName"
                :database="selectedDatabase"
                :table="selectedTable"
              />
            </KeepAlive>
            <KeepAlive>
              <QueryEditor 
                v-if="activeTab !== 'data' && activeTab !== 'schema'"
                :key="activeTab"
                :serverName="selectedServerName!"
                :serverType="selectedServerType"
                :database="selectedDatabase"
                v-model="queryTabs.find(t => t.id === activeTab)!.query"
                v-model:height="queryEditorHeight"
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
      @close="isModalOpen = false; editingServer = undefined"
      @connect="handleConnect"
      :editServer="editingServer"
    />
    <ErrorModal />
  </div>
</template>
