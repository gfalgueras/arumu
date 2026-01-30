<script setup lang="ts">
import { Power, PowerOff } from 'lucide-vue-next';

defineProps<{
  canClose: boolean;
}>();

const emit = defineEmits<{
  (e: 'openConnection'): void;
  (e: 'closeConnection'): void;
}>();
</script>

<template>
  <div class="h-10 bg-slate-900 border-b border-slate-700 flex items-center px-4 gap-2">
    <button 
      @click="emit('openConnection')"
      class="p-1.5 hover:bg-slate-800 rounded text-emerald-400"
      title="Open Connection"
    >
      <Power :size="18" />
    </button>
    <button 
      @click="emit('closeConnection')"
      :disabled="!canClose"
      class="p-1.5 rounded"
      :class="canClose ? 'hover:bg-slate-800 text-red-400' : 'text-slate-600 cursor-not-allowed'"
      title="Close Connection"
    >
      <PowerOff :size="18" />
    </button>
    <div class="h-4 w-px bg-slate-700 mx-2" />
  </div>
</template>
