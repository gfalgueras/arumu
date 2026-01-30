<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  initialValue: string;
  isLoading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'apply', value: string): void;
}>();

const value = ref(props.initialValue);

watch(() => props.initialValue, (newVal) => {
  value.value = newVal;
});

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    emit('apply', value.value);
  }
};
</script>

<template>
  <div class="relative">
    <input 
      type="text" 
      placeholder="Filter data..." 
      class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 w-48"
      v-model="value"
      @keydown="handleKeydown"
      :disabled="isLoading"
    />
  </div>
</template>
