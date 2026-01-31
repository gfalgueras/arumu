<script setup lang="ts">
import { watch } from 'vue';
import { Table, ChevronRight, ChevronDown, Columns, Loader2 } from 'lucide-vue-next';
import { $t } from '../../i18n';

const props = defineProps<{
  name: string;
  size?: number;
  columns?: string[];
  isSelected: boolean;
  isOpen: boolean;
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle', open: boolean): void;
  (e: 'select'): void;
  (e: 'expand'): void;
}>();

watch(() => props.isOpen, (newVal) => {
  if (newVal && (!props.columns || props.columns.length === 0) && !props.isLoading) {
    emit('expand');
  }
}, { immediate: true });

const formatSize = (bytes?: number) => {
  if (bytes === undefined) return '';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
</script>

<template>
  <div>
    <div 
      class="flex items-center gap-2 py-1 px-8 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer text-sm overflow-hidden group"
      :class="isSelected ? 'bg-blue-600/10 dark:bg-blue-600/30 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'"
      @click.stop="emit('select')"
    >
      <div 
        class="flex-shrink-0 hover:bg-slate-300 dark:hover:bg-slate-600 rounded p-0.5 -m-0.5"
        @click.stop="emit('toggle', !isOpen)"
      >
        <ChevronDown v-if="isOpen" :size="12" />
        <ChevronRight v-else :size="12" />
      </div>
      <Table :size="14" class="flex-shrink-0" :class="isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-400'" />
      <span class="truncate flex-1">{{ name }}</span>
      <span class="text-[10px] text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 flex-shrink-0">
        {{ formatSize(size) }}
      </span>
      <Loader2 v-if="isLoading" :size="12" class="animate-spin text-blue-500 flex-shrink-0 ml-1" />
    </div>
    
    <div v-if="isOpen" class="bg-slate-100 dark:bg-slate-900/50">
      <div 
        v-for="col in columns" 
        :key="col"
        class="flex items-center gap-2 py-0.5 px-16 text-[13px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
      >
        <Columns :size="12" class="text-slate-400 dark:text-slate-500" />
        <span class="truncate">{{ col }}</span>
      </div>
      <div v-if="!isLoading && (!columns || columns.length === 0)" class="pl-16 py-1 text-xs text-slate-500 dark:text-slate-500 italic">
        {{ $t('sidebar.no_columns') }}
      </div>
    </div>
  </div>
</template>
