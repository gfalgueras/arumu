<script setup lang="ts">
import { ref } from 'vue';
import { AlertTriangle } from 'lucide-vue-next';

const props = defineProps<{
  type: 'update' | 'delete';
  sql: string;
}>();

const emit = defineEmits<{
  (e: 'confirm', skip: boolean): void;
  (e: 'cancel'): void;
}>();

const skip = ref(false);

const typeLabel = props.type === 'update' ? 'UPDATE' : 'DELETE';
const accentClass = props.type === 'delete'
  ? 'text-red-600 dark:text-red-400'
  : 'text-amber-600 dark:text-amber-400';
const btnClass = props.type === 'delete'
  ? 'bg-red-600 hover:bg-red-500'
  : 'bg-amber-600 hover:bg-amber-500';
const bgClass = props.type === 'delete'
  ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-800'
  : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-800';
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-[9998] backdrop-blur-sm">
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-md shadow-2xl">
      <!-- Header -->
      <div class="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-700">
        <AlertTriangle :size="20" :class="accentClass" class="shrink-0" />
        <h2 class="font-semibold text-slate-900 dark:text-slate-100">
          Confirmar <span :class="accentClass">{{ typeLabel }}</span>
        </h2>
      </div>

      <!-- SQL preview -->
      <div class="p-4">
        <div :class="bgClass" class="border rounded-lg p-3 mb-4">
          <pre class="text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all leading-relaxed">{{ sql }}</pre>
        </div>

        <!-- Skip checkbox -->
        <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer select-none">
          <input type="checkbox" v-model="skip" class="w-4 h-4 accent-blue-500 rounded" />
          No preguntar más durante esta sesión
        </label>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 px-4 pb-4">
        <button
          @click="emit('cancel')"
          class="px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          Cancelar
        </button>
        <button
          @click="emit('confirm', skip)"
          :class="btnClass"
          class="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
        >
          Ejecutar {{ typeLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
