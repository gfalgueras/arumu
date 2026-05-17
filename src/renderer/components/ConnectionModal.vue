<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { Plus, Server, ChevronDown, Pencil } from 'lucide-vue-next';
import type { StoredServer } from '@shared/types/database';
import { showError } from '../errorService';
import { $t } from '../i18n';
import { api } from '../services/api';
import BaseButton from './ui/BaseButton.vue';
import BaseInput from './ui/BaseInput.vue';

const props = defineProps<{
  editServer?: StoredServer;
  connectionError?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'connect', server: StoredServer): void;
}>();

const storedServers = ref<StoredServer[]>([]);
const internalEditServer = ref<StoredServer | null>(null);
const showAddForm = ref(!!props.editServer);
const localError = ref(props.connectionError);
watch(() => props.connectionError, v => { localError.value = v; });
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

const startEditFromList = (server: StoredServer, e: MouseEvent) => {
  e.stopPropagation();
  localError.value = undefined;
  internalEditServer.value = server;
  formData.value = {
    name: server.name,
    type: server.type,
    host: server.config.host || 'localhost',
    port: server.config.port || 3306,
    user: server.config.user || 'root',
    password: server.config.password || '',
    defaultFilter: server.config.defaultFilter || 'mysql,information_schema,performance_schema,sys'
  };
  showAddForm.value = true;
};

const cancelForm = () => {
  if (props.editServer) {
    emit('close');
  } else {
    internalEditServer.value = null;
    showAddForm.value = false;
  }
};

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

    const editingName = props.editServer?.name || internalEditServer.value?.name;
    if (editingName) {
      await api.updateStoredServer(editingName, serverToSave);
      if (props.editServer) {
        emit('close');
      } else {
        internalEditServer.value = null;
        showAddForm.value = false;
        fetchStoredServers();
      }
    } else {
      await api.saveStoredServer(serverToSave);
      showAddForm.value = false;
      fetchStoredServers();
    }
  } catch (error: any) {
    console.error('Error saving connection:', error);
    showError('Error saving connection', error.message);
  }
};
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg w-full max-w-md flex flex-col max-h-[80vh] shadow-2xl">
      <!-- Header -->
      <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-800 rounded-t-lg flex-shrink-0">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">{{ $t('conn_modal.title') }}</h2>
        <BaseButton variant="icon" @click="emit('close')">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </BaseButton>
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
              <button
                class="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-opacity"
                :title="$t('common.edit')"
                @click="startEditFromList(server, $event)"
              >
                <Pencil :size="14" />
              </button>
            </div>
          </div>
          <button
            @click="showAddForm = true; localError = undefined"
            class="w-full py-2 border border-dashed border-slate-400 dark:border-slate-600 rounded flex items-center justify-center gap-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-600 dark:hover:border-slate-400 transition-colors"
          >
            <Plus :size="18" />
            <span>{{ $t('conn_modal.add_new') }}</span>
          </button>
          <div v-if="localError" class="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded text-sm text-red-700 dark:text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            <span>{{ localError }}</span>
          </div>
        </template>

        <form v-else @submit.prevent="handleSave" class="space-y-4 text-sm">
          <div class="space-y-2">
            <label class="text-slate-600 dark:text-slate-400 block font-medium">{{ $t('conn_modal.name_label') }}</label>
            <BaseInput required v-model="formData.name" />
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
              <BaseInput required v-model="formData.host" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="text-slate-600 dark:text-slate-400 block font-medium">{{ $t('conn_modal.port_label') }}</label>
              <BaseInput type="number" required v-model.number="formData.port" />
            </div>
            <div class="space-y-2">
              <label class="text-slate-600 dark:text-slate-400 block font-medium">{{ $t('conn_modal.user_label') }}</label>
              <BaseInput required v-model="formData.user" />
            </div>
          </div>
          <div class="space-y-2">
            <label class="text-slate-600 dark:text-slate-400 block font-medium">{{ $t('conn_modal.password_label') }}</label>
            <BaseInput type="password" v-model="formData.password" />
          </div>
          <div class="space-y-2">
            <label class="text-slate-600 dark:text-slate-400 block font-medium">{{ $t('conn_modal.filter_label') }}</label>
            <BaseInput small :placeholder="formData.defaultFilter" v-model="formData.defaultFilter" />
          </div>
          <div class="flex gap-2 pt-2">
            <BaseButton
              variant="secondary"
              size="md"
              type="button"
              class="flex-1 justify-center"
              @click="cancelForm"
            >
              {{ $t('common.cancel') }}
            </BaseButton>
            <BaseButton
              variant="primary"
              size="md"
              type="submit"
              class="flex-1 justify-center"
            >
              {{ $t('conn_modal.save_conn') }}
            </BaseButton>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
