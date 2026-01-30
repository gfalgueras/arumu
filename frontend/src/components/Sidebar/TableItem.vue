<script setup lang="ts">
import { Table } from 'lucide-vue-next';

defineProps<{
  name: string;
  size?: number;
  isSelected: boolean;
}>();

const emit = defineEmits<{
  (e: 'select'): void;
}>();

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
  <div 
    class="flex items-center gap-2 py-1 px-4 pl-12 hover:bg-slate-700 cursor-pointer text-sm overflow-hidden group"
    :class="isSelected ? 'bg-blue-600/30 text-blue-400' : 'text-slate-300'"
    @click.stop="emit('select')"
  >
    <Table :size="14" class="flex-shrink-0" :class="isSelected ? 'text-blue-400' : 'text-slate-400'" />
    <span class="truncate flex-1">{{ name }}</span>
    <span class="text-[10px] text-slate-500 group-hover:text-slate-300 flex-shrink-0">
      {{ formatSize(size) }}
    </span>
  </div>
</template>
