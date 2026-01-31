<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { X, Settings, Languages, ChevronDown } from 'lucide-vue-next';
import { $t, getLocale, setLocale, supportedLocales } from '../i18n';
import type { AppSettings } from '@shared/types/database';
import { showError } from '../errorService';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated'): void;
}>();

const language = ref(getLocale());

onMounted(async () => {
  try {
    const res = await fetch('http://localhost:3001/api/app-settings');
    const settings: AppSettings = await res.json();
    if (settings.language) {
      language.value = settings.language;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
});

const handleSave = async () => {
  try {
    const settings: AppSettings = {
      language: language.value
    };
    
    const res = await fetch('http://localhost:3001/api/app-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    
    if (res.ok) {
      setLocale(language.value === 'auto' ? 'auto' : language.value);
      emit('updated');
      emit('close');
    } else {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save settings');
    }
  } catch (err: any) {
    showError($t('common.error'), err.message);
  }
};
</script>

<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm px-4" @click.self="emit('close')">
    <div class="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
      <div class="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
        <div class="flex items-center gap-2 text-slate-100 font-semibold">
          <Settings :size="18" class="text-blue-400" />
          <h2>{{ $t('settings.title') }}</h2>
        </div>
        <button @click="emit('close')" class="text-slate-400 hover:text-slate-100 transition-colors p-1 hover:bg-slate-800 rounded">
          <X :size="20" />
        </button>
      </div>

      <div class="p-6 space-y-6">
        <div class="space-y-3">
          <label class="flex items-center gap-2 text-sm font-medium text-slate-300">
            <Languages :size="16" class="text-blue-400" />
            {{ $t('settings.language_label') }}
          </label>
          <div class="relative">
            <select 
              v-model="language" 
              class="w-full appearance-none bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer"
            >
              <option value="auto">{{ $t('settings.browser_default') }}</option>
              <option v-for="loc in supportedLocales" :key="loc.code" :value="loc.code">
                {{ loc.name }}
              </option>
            </select>
            <ChevronDown class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" :size="16" />
          </div>
        </div>
      </div>

      <div class="p-4 bg-slate-800/30 border-t border-slate-800 flex justify-end gap-3">
        <button 
          @click="emit('close')" 
          class="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
        >
          {{ $t('common.cancel') }}
        </button>
        <button 
          @click="handleSave"
          class="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-lg shadow-blue-500/20"
        >
          {{ $t('common.save') }}
        </button>
      </div>
    </div>
  </div>
</template>
