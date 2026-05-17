<script setup lang="ts">
import { ref } from 'vue';
import { X } from 'lucide-vue-next';
import { $t } from '../i18n';

const model = defineModel<string>();
const capturing = ref(false);
const el = ref<HTMLDivElement | null>(null);

const startCapture = () => {
  capturing.value = true;
  el.value?.focus();
};

const onKeydown = (e: KeyboardEvent) => {
  if (!capturing.value) return;
  e.preventDefault();
  e.stopPropagation();

  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);

  model.value = parts.join('+');
  capturing.value = false;
};

const onBlur = () => {
  capturing.value = false;
};

const clear = (e: MouseEvent) => {
  e.stopPropagation();
  model.value = '';
};
</script>

<template>
  <div
    ref="el"
    tabindex="0"
    @click="startCapture"
    @keydown="onKeydown"
    @blur="onBlur"
    class="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm cursor-pointer select-none transition-all focus:outline-none border"
    :class="capturing
      ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-50/50 dark:bg-blue-500/5'
      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:border-slate-400 dark:hover:border-slate-600'"
  >
    <span
      :class="capturing
        ? 'text-blue-500 italic text-xs'
        : model
          ? 'text-slate-900 dark:text-slate-200 font-mono font-medium'
          : 'text-slate-400 italic text-xs'"
    >
      {{ capturing ? $t('settings.press_key') : (model || $t('settings.click_to_set')) }}
    </span>
    <button
      v-if="model && !capturing"
      type="button"
      @click="clear"
      class="text-slate-400 hover:text-red-500 transition-colors shrink-0"
    >
      <X :size="13" />
    </button>
  </div>
</template>
