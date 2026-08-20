<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Settings } from 'lucide-vue-next';
import { $t } from '../../i18n';

defineProps<{
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'config'): void;
}>();

const menuRef = ref<HTMLDivElement | null>(null);

const handleClickOutside = (event: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit('close');
  }
};

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});

const handleConfig = (e: MouseEvent) => {
  e.stopPropagation();
  emit('config');
  emit('close');
};
</script>

<template>
  <div 
    ref="menuRef"
    class="fixed z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-xl py-1 w-48"
    :style="{ left: x + 'px', top: y + 'px' }"
  >
    <div 
      class="flex items-center gap-2 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-sm text-slate-700 dark:text-slate-200"
      @click="handleConfig"
    >
      <Settings :size="14" class="text-slate-400" />
      <span>{{ $t('topbar.options_title') }}</span>
    </div>
  </div>
</template>
