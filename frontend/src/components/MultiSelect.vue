<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { X, ChevronDown } from 'lucide-vue-next';

const props = defineProps<{
  modelValue: string[];
  options: string[];
  placeholder?: string;
  disabled?: boolean;
}>();

const emit = defineEmits(['update:modelValue', 'close']);

const isOpen = ref(false);
const containerRef = ref<HTMLElement | null>(null);

const toggleOpen = () => {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
  if (!isOpen.value) {
    emit('close');
  }
};

const selectOption = (option: string) => {
  if (props.modelValue.includes(option)) {
    emit('update:modelValue', props.modelValue.filter(v => v !== option));
  } else {
    emit('update:modelValue', [...props.modelValue, option]);
  }
};

const removeOption = (option: string) => {
  emit('update:modelValue', props.modelValue.filter(v => v !== option));
};

const handleClickOutside = (event: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    if (isOpen.value) {
      isOpen.value = false;
      emit('close');
    }
  }
};

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});
</script>

<template>
  <div ref="containerRef" class="relative">
    <div 
      @click="toggleOpen"
      class="min-h-[38px] w-full bg-slate-900 border rounded px-1.5 py-1 text-sm flex flex-wrap gap-1 items-center cursor-pointer transition-colors"
      :class="[
        isOpen ? 'border-blue-500 ring-1 ring-blue-500' : 'border-slate-700 hover:border-slate-600',
        disabled ? 'opacity-50 cursor-not-allowed' : 'text-slate-200'
      ]"
    >
      <div v-if="modelValue.length === 0" class="text-slate-500 px-1.5 select-none">{{ placeholder || 'Seleccionar...' }}</div>
      
      <div 
        v-for="val in modelValue" 
        :key="val"
        class="flex items-center gap-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-md text-[11px] font-medium"
      >
        {{ val }}
        <button 
          v-if="!disabled"
          @click.stop="removeOption(val)"
          class="hover:text-blue-100 transition-colors"
        >
          <X :size="12" />
        </button>
      </div>

      <div class="ml-auto pr-1 text-slate-500">
        <ChevronDown :size="16" class="transition-transform duration-200" :class="{ 'rotate-180': isOpen }" />
      </div>
    </div>

    <div 
      v-if="isOpen && !disabled" 
      class="absolute z-50 w-full mt-1 bg-slate-800 border border-slate-700 rounded-md shadow-xl max-h-60 overflow-auto scrollbar-thin scrollbar-thumb-slate-600"
    >
      <div 
        v-for="opt in options" 
        :key="opt"
        @click="selectOption(opt)"
        class="px-3 py-2 text-sm cursor-pointer transition-colors flex items-center justify-between group"
        :class="[
          modelValue.includes(opt) ? 'bg-blue-500/10 text-blue-400 font-medium' : 'text-slate-300 hover:bg-slate-700'
        ]"
      >
        <span>{{ opt }}</span>
        <div 
          v-if="modelValue.includes(opt)" 
          class="w-2 h-2 rounded-full bg-blue-500"
        ></div>
      </div>
      <div v-if="options.length === 0" class="px-3 py-4 text-center text-slate-500 text-xs italic">
        No hay opciones disponibles
      </div>
    </div>
  </div>
</template>
