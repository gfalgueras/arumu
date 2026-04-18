<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { RefreshCw, Loader2, Skull } from 'lucide-vue-next';
import { $t } from '../i18n';
import { api } from '../services/api';
import { showError } from '../errorService';

const props = defineProps<{
  serverName: string;
}>();

const processes = ref<any[]>([]);
const loading = ref(false);
const autoRefresh = ref(false);
let refreshInterval: ReturnType<typeof setInterval> | null = null;

const columns = ['Id', 'User', 'Host', 'db', 'Command', 'Time', 'State', 'Info'];

const load = async () => {
  if (loading.value) return;
  loading.value = true;
  try {
    const result = await api.getProcessList(props.serverName);
    processes.value = Array.isArray(result) ? result : [];
  } catch (err: any) {
    const msg = err.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || String(err);
    showError($t('process_list.error_load'), msg);
  } finally {
    loading.value = false;
  }
};

const killProcess = async (id: number) => {
  const label = $t('process_list.confirm_kill').replace('{id}', String(id));
  if (!confirm(label)) return;
  try {
    await api.killProcess(props.serverName, id);
    await load();
  } catch (err: any) {
    const msg = err.message?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || String(err);
    showError($t('process_list.error_kill'), msg);
  }
};

const toggleAutoRefresh = () => {
  autoRefresh.value = !autoRefresh.value;
  if (autoRefresh.value) {
    refreshInterval = setInterval(load, 3000);
  } else {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = null;
  }
};

onMounted(load);

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval);
});

const colLabel = (col: string): string => {
  const map: Record<string, string> = {
    Id: $t('process_list.id'),
    User: $t('process_list.user'),
    Host: $t('process_list.host'),
    db: $t('process_list.db'),
    Command: $t('process_list.command'),
    Time: $t('process_list.time'),
    State: $t('process_list.state'),
    Info: $t('process_list.info'),
  };
  return map[col] ?? col;
};

const truncate = (val: any, max = 80) => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return s.length > max ? s.slice(0, max) + '…' : s;
};
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <!-- Toolbar -->
    <div class="flex items-center gap-3 p-3 bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 shrink-0">
      <span class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ $t('process_list.title') }}</span>
      <div class="ml-auto flex items-center gap-2">
        <button
          @click="toggleAutoRefresh"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors"
          :class="autoRefresh
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400'"
        >
          <RefreshCw :size="12" :class="autoRefresh ? 'animate-spin' : ''" />
          {{ $t('process_list.auto_refresh') }}
        </button>
        <button
          @click="load"
          :disabled="loading"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 rounded-lg transition-colors disabled:opacity-40"
        >
          <Loader2 v-if="loading" :size="12" class="animate-spin" />
          <RefreshCw v-else :size="12" />
          {{ $t('process_list.refresh') }}
        </button>
      </div>
    </div>

    <!-- Table -->
    <div class="flex-1 overflow-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 border-t-0 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
      <table class="w-full text-left border-collapse min-w-max text-sm">
        <thead class="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 shadow-sm">
          <tr>
            <th v-for="col in columns" :key="col" class="px-3 py-2 font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap text-xs">
              {{ colLabel(col) }}
            </th>
            <th class="px-3 py-2 border-b border-slate-200 dark:border-slate-700 w-[60px]"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800/50">
          <tr v-if="loading && processes.length === 0">
            <td :colspan="columns.length + 1" class="py-10 text-center">
              <Loader2 class="animate-spin text-blue-500 mx-auto" :size="28" />
            </td>
          </tr>
          <tr v-else-if="processes.length === 0">
            <td :colspan="columns.length + 1" class="py-8 text-center text-slate-400 italic text-sm">
              {{ $t('process_list.no_processes') }}
            </td>
          </tr>
          <tr
            v-for="proc in processes"
            :key="proc.Id"
            class="hover:bg-slate-50 dark:hover:bg-slate-800/40 group transition-colors"
          >
            <td v-for="col in columns" :key="col" class="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800/30 last:border-r-0 max-w-[200px]">
              <span v-if="proc[col] === null || proc[col] === undefined" class="text-slate-400 dark:text-slate-600 italic">NULL</span>
              <span v-else :title="String(proc[col])">{{ truncate(proc[col]) }}</span>
            </td>
            <td class="px-2 py-1.5 w-[60px]">
              <button
                @click="killProcess(proc.Id)"
                class="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 transition-all"
                :title="$t('process_list.kill')"
              >
                <Skull :size="10" />
                {{ $t('process_list.kill') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
