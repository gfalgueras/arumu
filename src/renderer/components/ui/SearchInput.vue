<script setup lang="ts">
import { Search } from 'lucide-vue-next';

defineProps<{
  placeholder?: string;
}>();

const model = defineModel<string>();
</script>

<template>
  <div class="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1">
    <Search :size="13" class="text-slate-400 shrink-0" />
    <input
      v-model="model"
      :placeholder="placeholder"
      class="flex-1 text-xs bg-transparent text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none"
    />
  </div>
</template>
