<script setup lang="ts">
import { X, Copy, Check } from 'lucide-vue-next';
import { ref } from 'vue';
import { $t } from '../i18n';

const props = defineProps<{
  title: string;
  code: string;
  show: boolean;
}>();

const emit = defineEmits(['close']);

const copied = ref(false);

const handleCopy = async () => {
  try {
    await navigator.clipboard.writeText(props.code);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div v-if="show" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm px-4" @click.self="emit('close')">
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-3xl overflow-hidden shadow-2xl">
        <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
          <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100">{{ title }}</h2>
          <div class="flex items-center gap-2">
            <button 
              @click="handleCopy"
              class="flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors rounded bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
            >
              <Check v-if="copied" :size="14" />
              <Copy v-else :size="14" />
              {{ copied ? $t('common.copied') : ($t('common.copy_to_clipboard') || 'Copy to clipboard') }}
            </button>
            <button @click="emit('close')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-100 transition-colors p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded">
              <X :size="20" />
            </button>
          </div>
        </div>

        <div class="p-6">
          <div class="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4 font-mono text-sm text-blue-700 dark:text-blue-300 break-words whitespace-pre-wrap max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {{ code }}
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>
