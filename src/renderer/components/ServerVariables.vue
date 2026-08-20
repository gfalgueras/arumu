<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { RefreshCw, Loader2 } from 'lucide-vue-next';
import { $t } from '../i18n';
import { api } from '../services/api';
import { showError } from '../errorService';
import BaseButton from './ui/BaseButton.vue';
import SearchInput from './ui/SearchInput.vue';
import type { VariableRow } from '@shared/types/database';

const props = defineProps<{
  serverName: string;
}>();

const variables = ref<VariableRow[]>([]);
const status = ref<VariableRow[]>([]);
const loading = ref(false);
const search = ref('');
const activeSubTab = ref<'variables' | 'status'>('variables');

const activeList = computed(() => activeSubTab.value === 'variables' ? variables.value : status.value);

const filtered = computed(() => {
  if (!search.value.trim()) return activeList.value;
  const q = search.value.toLowerCase();
  return activeList.value.filter((row: VariableRow) => {
    const name = (row.name || '').toLowerCase();
    const val = String(row.value ?? '').toLowerCase();
    return name.includes(q) || val.includes(q);
  });
});

const load = async () => {
  loading.value = true;
  try {
    const result = await api.getServerVariables(props.serverName);
    variables.value = result.variables || [];
    status.value = result.status || [];
  } catch (err) {
    const msg = (err instanceof Error ? err.message : undefined)?.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') || String(err);
    showError($t('variables.error'), msg);
  } finally {
    loading.value = false;
  }
};

const onKeydown = (e: KeyboardEvent) => { if (e.key === 'F5') { e.preventDefault(); e.stopImmediatePropagation(); load(); } };

onMounted(() => { load(); window.addEventListener('keydown', onKeydown); });
onUnmounted(() => { window.removeEventListener('keydown', onKeydown); });
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <!-- Toolbar -->
    <div class="flex items-center gap-2 p-3 bg-slate-100 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 shrink-0 flex-wrap">
      <!-- Sub-tabs -->
      <div class="flex border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden text-xs font-medium">
        <button
          @click="activeSubTab = 'variables'"
          class="px-3 py-1.5 transition-colors"
          :class="activeSubTab === 'variables'
            ? 'bg-blue-600 text-white'
            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'"
        >
          {{ $t('variables.variables_tab') }}
          <span class="ml-1 text-[10px] opacity-70">({{ variables.length }})</span>
        </button>
        <button
          @click="activeSubTab = 'status'"
          class="px-3 py-1.5 transition-colors border-l border-slate-300 dark:border-slate-600"
          :class="activeSubTab === 'status'
            ? 'bg-blue-600 text-white'
            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'"
        >
          {{ $t('variables.status_tab') }}
          <span class="ml-1 text-[10px] opacity-70">({{ status.length }})</span>
        </button>
      </div>

      <SearchInput v-model="search" :placeholder="$t('variables.search_placeholder')" class="flex-1 min-w-[180px]" />

      <BaseButton @click="load" :loading="loading" class="ml-auto">
        <RefreshCw v-if="!loading" :size="12" />
        {{ $t('process_list.refresh') }}
      </BaseButton>
    </div>

    <!-- Table -->
    <div class="flex-1 overflow-auto bg-white dark:bg-slate-900 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
      <div v-if="loading && activeList.length === 0" class="flex items-center justify-center py-16">
        <Loader2 class="animate-spin text-blue-500" :size="32" />
      </div>
      <div v-else-if="filtered.length === 0" class="py-10 text-center text-slate-400 italic text-sm">
        {{ $t('variables.no_results') }}
      </div>
      <table v-else class="w-full text-left border-collapse table-fixed">
        <colgroup>
          <col style="width: 320px" />
          <col />
        </colgroup>
        <thead class="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 shadow-sm">
          <tr>
            <th class="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">{{ $t('variables.name') }}</th>
            <th class="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">{{ $t('variables.value') }}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-50 dark:divide-slate-800/50">
          <tr
            v-for="row in filtered"
            :key="row.name"
            class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group"
          >
            <td class="px-4 py-1.5 text-xs font-mono text-blue-700 dark:text-blue-300 border-r border-slate-100 dark:border-slate-800/30 truncate" :title="row.name">
              {{ row.name }}
            </td>
            <td class="px-4 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-300">
              <span
                :class="{
                  'text-emerald-600 dark:text-emerald-400': String(row.value).toUpperCase() === 'ON' || String(row.value) === '1',
                  'text-red-500 dark:text-red-400': String(row.value).toUpperCase() === 'OFF' || String(row.value) === '0',
                }"
              >{{ row.value ?? '' }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
