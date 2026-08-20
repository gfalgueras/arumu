<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';

withDefaults(defineProps<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'text' | 'danger' | 'icon';
  size?: 'xs' | 'sm' | 'md';
  loading?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}>(), {
  variant: 'ghost',
  size: 'sm',
  type: 'button',
});
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="flex items-center font-medium transition-colors disabled:opacity-40"
    :class="[
      variant === 'primary'    && 'bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-lg shadow-blue-500/20',
      variant === 'secondary'  && 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg',
      variant === 'ghost'      && 'border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg',
      variant === 'text'       && 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
      variant === 'danger'     && 'bg-red-500 hover:bg-red-600 text-white rounded',
      variant === 'icon'       && 'p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded',
      variant !== 'icon' && size === 'xs' && 'gap-1 px-1.5 py-0.5 text-[10px]',
      variant !== 'icon' && size === 'sm' && 'gap-1.5 px-3 py-1.5 text-xs',
      variant !== 'icon' && size === 'md' && 'gap-2 px-4 py-2 text-sm',
    ]"
  >
    <Loader2 v-if="loading" :size="size === 'xs' ? 10 : size === 'sm' ? 12 : 14" class="animate-spin" />
    <slot />
  </button>
</template>
