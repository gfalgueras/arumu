<script setup lang="ts">
defineProps<{
  type?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  small?: boolean;
}>();

const model = defineModel<string | number>();
</script>

<template>
  <input
    v-bind="$attrs"
    :type="type ?? 'text'"
    :placeholder="placeholder"
    :required="required"
    :disabled="disabled"
    v-model="model"
    class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded p-2 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all disabled:opacity-50"
    :class="small && 'text-xs'"
  />
</template>
