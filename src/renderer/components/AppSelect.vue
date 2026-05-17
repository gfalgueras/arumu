<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ChevronDown, Check } from 'lucide-vue-next';

interface Option {
  value: string;
  label: string;
}

const props = defineProps<{
  options: Option[];
  placeholder?: string;
}>();

const model = defineModel<string>();
const open = ref(false);
const container = ref<HTMLElement | null>(null);

const selected = computed(() => props.options.find(o => o.value === model.value));

const select = (value: string) => {
  model.value = value;
  open.value = false;
};

const handleOutsideClick = (e: MouseEvent) => {
  if (container.value && !container.value.contains(e.target as Node)) {
    open.value = false;
  }
};

onMounted(() => document.addEventListener('mousedown', handleOutsideClick));
onUnmounted(() => document.removeEventListener('mousedown', handleOutsideClick));
</script>

<template>
  <div class="relative" ref="container">
    <button
      type="button"
      @click="open = !open"
      class="w-full flex items-center justify-between gap-2 bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer text-sm"
    >
      <span :class="selected ? 'text-slate-900 dark:text-slate-200' : 'text-slate-400'">
        {{ selected?.label || placeholder || '...' }}
      </span>
      <ChevronDown
        :size="16"
        class="text-slate-500 shrink-0 transition-transform duration-150"
        :class="open ? 'rotate-180' : ''"
      />
    </button>

    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 scale-95 -translate-y-1"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 -translate-y-1"
    >
      <div
        v-if="open"
        class="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden"
      >
        <button
          v-for="opt in options"
          :key="opt.value"
          type="button"
          @click="select(opt.value)"
          class="w-full flex items-center justify-between px-3 py-2 text-sm transition-colors"
          :class="model === opt.value
            ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'"
        >
          {{ opt.label }}
          <Check v-if="model === opt.value" :size="14" class="text-blue-500 shrink-0" />
        </button>
      </div>
    </Transition>
  </div>
</template>
