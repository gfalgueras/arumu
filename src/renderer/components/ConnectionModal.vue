<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Plus, X, Server, ChevronDown } from 'lucide-vue-next';
import type { StoredServer } from '@shared/types/database';
import { showError } from '../errorService';
import { $t } from '../i18n';
import { api } from '../services/api';

const props = defineProps<{
  editServer?: StoredServer;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'connect', server: StoredServer): void;
}>();

const storedServers = ref<StoredServer[]>([]);
const showAddForm = ref(!!props.editServer);
const formData = ref({
  name: props.editServer?.name || '',
  type: props.editServer?.type || ('mysql' as 'mysql' | 'postgres' | 'sqlite'),
  host: props.editServer?.config.host || 'localhost',
  port: props.editServer?.config.port || 3306,
  user: props.editServer?.config.user || 'root',
  password: props.editServer?.config.password || '',
  defaultFilter: props.editServer?.config.defaultFilter || 'mysql,information_schema,performance_schema,sys'
});

const fetchStoredServers = async () => {
  const data = await api.getStoredServers();
  storedServers.value = data;
};

onMounted(() => {
  if (!props.editServer) {
    fetchStoredServers();
  }
});

const handleSave = async () => {
  try {
    const serverToSave = {
      name: formData.value.name,
      type: formData.value.type,
      config: {
        host: formData.value.host,
        port: formData.value.port,
        user: formData.value.user,
        password: formData.value.password,
        defaultFilter: formData.value.defaultFilter
      }
    };
    
    if (props.editServer) {
      await api.updateStoredServer(props.editServer.name, serverToSave);
      emit('close');
    } else {
      await api.saveStoredServer(serverToSave);
      showAddForm.value = false;
      fetchStoredServers();
    }
  } catch (error: any) {
    console.error('Error saving connection:', error);
    showError('Error al guardar conexión', error.message);
  }
};
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg w-full max-w-md overflow-hidden flex flex-col max-h-[80vh] shadow-2xl">
      <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">{{ $t('conn_modal.title') }}</h2>
        <button @click="emit('close')" class="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
          <X :size="20" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <template v-if="!showAddForm">
          <div v-if="storedServers.length === 0" class="text-center py-8 text-slate-500 italic">
            {{ $t('conn_modal.no_saved') }}
          </div>
          <div v-else class="space-y-2">
            <div 
              v-for="server in storedServers"
              :key="server.name"
              class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 hover:border-blue-500 cursor-pointer group"
              @click="emit('connect', server)"
            >
              <div class="flex items-center gap-3">
                <Server :size="18" class="text-emerald-600 dark:text-emerald-400" />
                <div>
                  <div class="font-medium text-slate-900 dark:text-slate-200">{{ server.name }}</div>
                  <div class="text-xs text-slate-500">{{ server.type }} - {{ server.config.host }}:{{ server.config.port }}</div>
                </div>
              </div>
            </div>
          </div>
          <button 
            @click="showAddForm = true"
            class="w-full py-2 border border-dashed border-slate-400 dark:border-slate-600 rounded flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-600 dark:hover:border-slate-400 transition-colors"
          >
            <Plus :size="18" />
            <span>{{ $t('conn_modal.add_new') }}</span>
          </button>
        </template>
        
        <form v-else @submit.prevent="handleSave" class="space-y-4 text-sm">
          <div class="space-y-2">
            <label class="text-slate-600 dark:text-slate-400 block font-medium">{{ $t('conn_modal.name_label') }}</label>
            <input 
              required
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" 
              v-model="formData.name"
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="text-slate-600 dark:text-slate-400 block font-medium">{{ $t('conn_modal.type_label') }}</label>
              <div class="relative">
                <select 
                  class="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-2 pr-8 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer"
                  v-model="formData.type"
                >
                  <option value="mysql">MySQL</option>
                  <option value="postgres">PostgreSQL</option>
                  <option value="sqlite">SQLite</option>
                </select>
                <ChevronDown class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" :size="14" />
              </div>
            </div>
            <div class="space-y-2">
              <label class="text-slate-600 dark:text-slate-400 block font-medium">{{ $t('conn_modal.host_label') }}</label>
              <input 
                required
                class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" 
                v-model="formData.host"
              />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="text-slate-600 dark:text-slate-400 block font-medium">{{ $t('conn_modal.port_label') }}</label>
              <input 
                type="number"
                required
                class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" 
                v-model.number="formData.port"
              />
            </div>
            <div class="space-y-2">
              <label class="text-slate-600 dark:text-slate-400 block font-medium">{{ $t('conn_modal.user_label') }}</label>
              <input 
                required
                class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" 
                v-model="formData.user"
              />
            </div>
          </div>
          <div class="space-y-2">
            <label class="text-slate-600 dark:text-slate-400 block font-medium">{{ $t('conn_modal.password_label') }}</label>
            <input 
              type="password"
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all" 
              v-model="formData.password"
            />
          </div>
          <div class="space-y-2">
            <label class="text-slate-600 dark:text-slate-400 block font-medium">{{ $t('conn_modal.filter_label') }}</label>
            <input 
              class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all text-xs" 
              :placeholder="formData.defaultFilter"
              v-model="formData.defaultFilter"
            />
          </div>
          <div class="flex gap-2 pt-2">
            <button 
              type="button"
              @click="editServer ? emit('close') : (showAddForm = false)"
              class="flex-1 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors font-medium"
            >
              {{ $t('common.cancel') }}
            </button>
            <button 
              type="submit"
              class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20 font-medium"
            >
              {{ $t('conn_modal.save_conn') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
