<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { Settings } from 'lucide-vue-next';

const props = defineProps<{
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
    class="fixed z-50 bg-slate-800 border border-slate-700 rounded shadow-xl py-1 w-48"
    :style="{ left: x + 'px', top: y + 'px' }"
  >
    <div 
      class="flex items-center gap-2 px-3 py-2 hover:bg-slate-700 cursor-pointer text-sm text-slate-200"
      @click="handleConfig"
    >
      <Settings :size="14" class="text-slate-400" />
      <span>Configuración</span>
    </div>
  </div>
</template>
