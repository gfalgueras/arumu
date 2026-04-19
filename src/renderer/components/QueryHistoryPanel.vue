<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Trash2, Play, Clock } from 'lucide-vue-next';
import { $t } from '../i18n';
import { api } from '../services/api';
import type { QueryHistoryEntry } from '@shared/types/database';
import SearchInput from './ui/SearchInput.vue';
import BaseButton from './ui/BaseButton.vue';

const emit = defineEmits<{
  (e: 'use', sql: string): void;
}>();

const history = ref<QueryHistoryEntry[]>([]);
const search = ref('');

const filtered = computed(() => {
  if (!search.value.trim()) return history.value;
  const q = search.value.toLowerCase();
  return history.value.filter(h => h.sql.toLowerCase().includes(q) || (h.database || '').toLowerCase().includes(q));
});

const load = async () => {
  history.value = await api.getQueryHistory();
};

const clearHistory = async () => {
  if (!confirm($t('query_editor.history_clear') + '?')) return;
  await api.clearQueryHistory();
  history.value = [];
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString();
};

const preview = (sql: string) => sql.replace(/\s+/g, ' ').trim().slice(0, 120);

onMounted(load);
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 shrink-0">
      <div class="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
        <Clock :size="14" class="text-blue-500" />
        {{ $t('query_editor.history') }}
      </div>
      <BaseButton
        v-if="history.length > 0"
        variant="text"
        size="xs"
        class="text-red-500 hover:text-red-600"
        @click="clearHistory"
      >
        <Trash2 :size="12" />
        {{ $t('query_editor.history_clear') }}
      </BaseButton>
    </div>

    <!-- Search -->
    <div class="px-3 py-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
      <SearchInput v-model="search" :placeholder="$t('sidebar.search_db')" />
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
      <div v-if="filtered.length === 0" class="p-6 text-center text-slate-400 italic text-sm">
        {{ $t('query_editor.history_empty') }}
      </div>
      <div
        v-for="entry in filtered"
        :key="entry.id"
        class="group border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div class="px-3 py-2">
          <!-- Meta row -->
          <div class="flex items-center justify-between gap-2 mb-1">
            <div class="flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
              <span>{{ formatDate(entry.executedAt) }}</span>
              <span v-if="entry.database" class="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">{{ entry.database }}</span>
              <span :class="entry.error ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'">
                {{ entry.error ? 'ERR' : (entry.rowCount != null ? entry.rowCount + ' rows' : '') }}
              </span>
              <span class="text-slate-300 dark:text-slate-600">{{ entry.duration }}ms</span>
            </div>
            <BaseButton
              variant="primary"
              size="xs"
              class="opacity-0 group-hover:opacity-100"
              @click="emit('use', entry.sql)"
              :title="$t('query_editor.history_use')"
            >
              <Play :size="9" />
              {{ $t('query_editor.history_use') }}
            </BaseButton>
          </div>
          <!-- Query preview -->
          <pre class="text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap break-all leading-relaxed" :class="entry.error ? 'text-red-500 dark:text-red-400' : ''">{{ preview(entry.sql) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
