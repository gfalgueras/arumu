<script setup lang="ts">
import { computed, inject, type Ref } from 'vue';
import { Table } from 'lucide-vue-next';

const props = defineProps<{
  name: string;
  size?: number;
  isSelected: boolean;
}>();

const emit = defineEmits<{
  (e: 'select'): void;
}>();

const menuDensity = inject<Ref<string>>('menuDensity');
const compact = computed(() => menuDensity?.value === 'compact');

const serverTotalSize = inject<Ref<number>>('serverTotalSize');
const sizePercent = computed(() => {
  if (!props.size || !serverTotalSize?.value) return 0;
  return Math.min(100, (props.size / serverTotalSize.value) * 100);
});

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
    class="relative flex items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer overflow-hidden group"
    :class="[
      compact ? 'py-0.5 px-7 text-xs' : 'py-1 px-10 text-sm',
      isSelected ? 'bg-blue-600/10 dark:bg-blue-600/30 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'
    ]"
    @click.stop="emit('select')"
  >
    <div
      v-if="!compact && sizePercent > 0"
      class="absolute inset-y-0 left-0 bg-blue-400/10 dark:bg-blue-400/8 pointer-events-none"
      :style="{ width: sizePercent + '%' }"
    />
    <Table :size="compact ? 11 : 14" class="relative flex-shrink-0" :class="isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-400'" />
    <span class="relative truncate flex-1">{{ name }}</span>
    <span class="relative text-[10px] text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 flex-shrink-0">
      {{ formatSize(size) }}
    </span>
  </div>
</template>
