<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Trash2, Play, Plus, Bookmark } from 'lucide-vue-next';
import { $t } from '../i18n';
import { api } from '../services/api';
import SearchInput from './ui/SearchInput.vue';
import BaseButton from './ui/BaseButton.vue';
import BaseInput from './ui/BaseInput.vue';

interface Snippet {
  id: string;
  name: string;
  sql: string;
  createdAt: string;
}

const props = defineProps<{
  currentQuery?: string;
}>();

const emit = defineEmits<{
  (e: 'use', sql: string): void;
}>();

const snippets = ref<Snippet[]>([]);
const search = ref('');
const showAddForm = ref(false);
const newName = ref('');

const filtered = computed(() => {
  if (!search.value.trim()) return snippets.value;
  const q = search.value.toLowerCase();
  return snippets.value.filter(s => s.name.toLowerCase().includes(q) || s.sql.toLowerCase().includes(q));
});

const load = async () => {
  snippets.value = await api.getSnippets();
};

const addSnippet = async () => {
  if (!newName.value.trim() || !props.currentQuery?.trim()) return;
  const snippet: Snippet = {
    id: Date.now().toString(),
    name: newName.value.trim(),
    sql: props.currentQuery.trim(),
    createdAt: new Date().toISOString(),
  };
  await api.saveSnippet(snippet);
  newName.value = '';
  showAddForm.value = false;
  await load();
};

const deleteSnippet = async (id: string) => {
  if (!confirm($t('snippets.confirm_delete'))) return;
  await api.deleteSnippet(id);
  await load();
};

const preview = (sql: string) => sql.replace(/\s+/g, ' ').trim().slice(0, 120);

onMounted(load);
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 shrink-0">
      <div class="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
        <Bookmark :size="14" class="text-blue-500" />
        {{ $t('snippets.title') }}
      </div>
      <button
        @click="showAddForm = !showAddForm"
        :disabled="!currentQuery?.trim()"
        class="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors disabled:opacity-40"
        :class="showAddForm
          ? 'border-red-300 dark:border-red-700 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
          : 'border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10'"
      >
        <Plus :size="12" />
        {{ $t('snippets.add') }}
      </button>
    </div>

    <!-- Add form -->
    <div v-if="showAddForm" class="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-blue-50/50 dark:bg-blue-500/5 shrink-0">
      <div class="flex items-center gap-2">
        <BaseInput
          v-model="newName"
          :placeholder="$t('snippets.name_placeholder')"
          small
          class="flex-1"
          @keyup.enter="addSnippet"
          @keyup.escape="showAddForm = false"
          autofocus
        />
        <BaseButton
          variant="primary"
          size="sm"
          :disabled="!newName.trim()"
          @click="addSnippet"
        >
          {{ $t('snippets.save') }}
        </BaseButton>
      </div>
      <p class="text-[10px] text-slate-400 mt-1 truncate">Saves: {{ (currentQuery || '').replace(/\s+/g, ' ').trim().slice(0, 80) }}</p>
    </div>

    <!-- Search -->
    <div class="px-3 py-2 border-b border-slate-200 dark:border-slate-800 shrink-0">
      <SearchInput v-model="search" :placeholder="$t('sidebar.search_db')" />
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent">
      <div v-if="filtered.length === 0" class="p-6 text-center text-slate-400 italic text-sm">
        {{ $t('snippets.empty') }}
      </div>
      <div
        v-for="snippet in filtered"
        :key="snippet.id"
        class="group border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div class="px-3 py-2">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{{ snippet.name }}</span>
            <div class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <BaseButton
                variant="primary"
                size="xs"
                @click="emit('use', snippet.sql)"
                :title="$t('snippets.use')"
              >
                <Play :size="9" />
                {{ $t('snippets.use') }}
              </BaseButton>
              <BaseButton
                variant="icon"
                class="hover:text-red-500 dark:hover:text-red-400"
                @click="deleteSnippet(snippet.id)"
                :title="$t('snippets.delete')"
              >
                <Trash2 :size="12" />
              </BaseButton>
            </div>
          </div>
          <pre class="text-xs text-slate-500 dark:text-slate-400 font-mono whitespace-pre-wrap break-all leading-relaxed">{{ preview(snippet.sql) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>
