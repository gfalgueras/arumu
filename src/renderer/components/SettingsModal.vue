<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { X, Settings, Languages, Moon, Keyboard } from 'lucide-vue-next';
import { $t, getLocale, setLocale, supportedLocales } from '../i18n';
import { api } from '../services/api';
import type { AppSettings } from '@shared/types/database';
import { showError } from '../errorService';
import { applyHotkeys, defaultHotkeys } from '../hotkeys';
import AppSelect from './AppSelect.vue';
import HotkeyInput from './HotkeyInput.vue';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated'): void;
}>();

type Tab = 'general' | 'keyboard';
const activeTab = ref<Tab>('general');

const language = ref(getLocale());
const theme = ref<AppSettings['theme']>('system');

const hotkeyCloseTab = ref('');
const hotkeyExecuteAll = ref('');
const hotkeyExecuteStatement = ref('');
const hotkeyNewTab = ref('');

onMounted(async () => {
  try {
    const settings: AppSettings = await api.getAppSettings();
    if (settings.language) language.value = settings.language;
    if (settings.theme) theme.value = settings.theme;
    hotkeyCloseTab.value = settings.hotkeys?.closeTab ?? defaultHotkeys.closeTab;
    hotkeyExecuteAll.value = settings.hotkeys?.executeAll ?? defaultHotkeys.executeAll;
    hotkeyExecuteStatement.value = settings.hotkeys?.executeStatement ?? defaultHotkeys.executeStatement;
    hotkeyNewTab.value = settings.hotkeys?.newTab ?? defaultHotkeys.newTab;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
});

const handleSave = async () => {
  try {
    const settings: AppSettings = {
      language: language.value,
      theme: theme.value,
      hotkeys: {
        closeTab: hotkeyCloseTab.value || defaultHotkeys.closeTab,
        executeAll: hotkeyExecuteAll.value || defaultHotkeys.executeAll,
        executeStatement: hotkeyExecuteStatement.value || defaultHotkeys.executeStatement,
        newTab: hotkeyNewTab.value || defaultHotkeys.newTab,
      },
    };
    await api.saveAppSettings(settings);
    setLocale(language.value === 'auto' ? 'auto' : language.value);
    applyHotkeys(settings.hotkeys!);
    emit('updated');
    emit('close');
  } catch (err: any) {
    showError($t('common.error'));
  }
};

const languageOptions = [
  { value: 'auto', label: $t('settings.browser_default') },
  ...supportedLocales.map(l => ({ value: l.code, label: l.name })),
];

const themeOptions = [
  { value: 'system', label: $t('settings.theme_system') },
  { value: 'light', label: $t('settings.theme_light') },
  { value: 'dark', label: $t('settings.theme_dark') },
];
</script>

<template>
  <div
    class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm px-4"
    @click.self="emit('close')"
  >
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-lg shadow-2xl">

      <!-- Header -->
      <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 rounded-t-xl">
        <div class="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-semibold">
          <Settings :size="18" class="text-blue-600 dark:text-blue-400" />
          <h2>{{ $t('settings.title') }}</h2>
        </div>
        <button
          @click="emit('close')"
          class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-100 transition-colors p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
        >
          <X :size="20" />
        </button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
        <button
          @click="activeTab = 'general'"
          class="flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'general'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
        >
          <Languages :size="15" />
          {{ $t('settings.tab_general') }}
        </button>
        <button
          @click="activeTab = 'keyboard'"
          class="flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'keyboard'
            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'"
        >
          <Keyboard :size="15" />
          {{ $t('settings.tab_keyboard') }}
        </button>
      </div>

      <!-- General Tab -->
      <div v-if="activeTab === 'general'" class="p-6 space-y-5 text-slate-900 dark:text-slate-100">
        <div class="space-y-2">
          <label class="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Languages :size="15" class="text-blue-500 dark:text-blue-400" />
            {{ $t('settings.language_label') }}
          </label>
          <AppSelect v-model="language" :options="languageOptions" />
        </div>

        <div class="space-y-2">
          <label class="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
            <Moon :size="15" class="text-blue-500 dark:text-blue-400" />
            {{ $t('settings.theme_label') }}
          </label>
          <AppSelect v-model="theme" :options="themeOptions" />
        </div>
      </div>

      <!-- Keyboard Tab -->
      <div v-if="activeTab === 'keyboard'" class="p-6 space-y-3 text-slate-900 dark:text-slate-100">
        <div class="flex items-center justify-between gap-4">
          <span class="text-sm text-slate-600 dark:text-slate-300 w-52 shrink-0">{{ $t('settings.hotkey_close_tab') }}</span>
          <div class="flex-1"><HotkeyInput v-model="hotkeyCloseTab" /></div>
        </div>
        <div class="flex items-center justify-between gap-4">
          <span class="text-sm text-slate-600 dark:text-slate-300 w-52 shrink-0">{{ $t('settings.hotkey_execute_all') }}</span>
          <div class="flex-1"><HotkeyInput v-model="hotkeyExecuteAll" /></div>
        </div>
        <div class="flex items-center justify-between gap-4">
          <span class="text-sm text-slate-600 dark:text-slate-300 w-52 shrink-0">{{ $t('settings.hotkey_execute_statement') }}</span>
          <div class="flex-1"><HotkeyInput v-model="hotkeyExecuteStatement" /></div>
        </div>
        <div class="flex items-center justify-between gap-4">
          <span class="text-sm text-slate-600 dark:text-slate-300 w-52 shrink-0">{{ $t('settings.hotkey_new_tab') }}</span>
          <div class="flex-1"><HotkeyInput v-model="hotkeyNewTab" /></div>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3 rounded-b-xl">
        <button
          @click="emit('close')"
          class="px-4 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
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
