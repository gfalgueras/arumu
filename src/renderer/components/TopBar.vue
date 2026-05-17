<script setup lang="ts">
import { Power, PowerOff, Settings } from 'lucide-vue-next';
import { $t } from '../i18n';

defineProps<{
  canClose: boolean;
}>();

const emit = defineEmits<{
  (e: 'openConnection'): void;
  (e: 'closeConnection'): void;
  (e: 'openSettings'): void;
}>();
</script>

<template>
  <div class="h-10 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex items-center px-4 gap-2">
    <button 
      @click="emit('openConnection')"
      class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-emerald-600 dark:text-emerald-400"
      :title="$t('topbar.open_conn_title')"
    >
      <Power :size="18" />
    </button>
    <button 
      @click="emit('closeConnection')"
      :disabled="!canClose"
      class="p-1.5 rounded"
      :class="canClose ? 'hover:bg-slate-200 dark:hover:bg-slate-800 text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-slate-600 cursor-not-allowed'"
      :title="$t('topbar.close_conn_title')"
    >
      <PowerOff :size="18" />
    </button>
    <div class="h-4 w-px bg-slate-300 dark:bg-slate-700 mx-2" />
    <button 
      @click="emit('openSettings')"
      class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      :title="$t('topbar.options_title')"
    >
      <Settings :size="18" />
    </button>
  </div>
</template>
