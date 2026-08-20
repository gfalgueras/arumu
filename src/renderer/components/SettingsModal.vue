<script setup lang="ts">
import { ref, onMounted, type Component } from 'vue';
import { X, Languages, Keyboard, PanelLeft, Settings } from 'lucide-vue-next';
import { $t, getLocale, setLocale, supportedLocales } from '../i18n';
import { api } from '../services/api';
import type { AppSettings } from '@shared/types/database';
import { showError } from '../errorService';
import { applyHotkeys, defaultHotkeys } from '../hotkeys';
import AppSelect from './AppSelect.vue';
import HotkeyInput from './HotkeyInput.vue';
import BaseButton from './ui/BaseButton.vue';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'updated'): void;
}>();

type Tab = 'general' | 'keyboard' | 'menu';
const activeTab = ref<Tab>('general');

const language = ref(getLocale());
const theme = ref<AppSettings['theme']>('system');
const menuDensity = ref<AppSettings['menuDensity']>('standard');

const hotkeyCloseTab = ref('');
const hotkeyExecuteAll = ref('');
const hotkeyExecuteStatement = ref('');
const hotkeyNewTab = ref('');

onMounted(async () => {
  try {
    const settings: AppSettings = await api.getAppSettings();
    if (settings.language) language.value = settings.language;
    if (settings.theme) theme.value = settings.theme;
    if (settings.menuDensity) menuDensity.value = settings.menuDensity;
    hotkeyCloseTab.value = settings.hotkeys?.closeTab ?? defaultHotkeys.closeTab;
    hotkeyExecuteAll.value = settings.hotkeys?.executeAll ?? defaultHotkeys.executeAll;
    hotkeyExecuteStatement.value = settings.hotkeys?.executeStatement ?? defaultHotkeys.executeStatement;
    hotkeyNewTab.value = settings.hotkeys?.newTab ?? defaultHotkeys.newTab;
  } catch {
    // settings load failed — defaults stay
  }
});

const handleSave = async () => {
  try {
    const settings: AppSettings = {
      language: language.value,
      theme: theme.value,
      menuDensity: menuDensity.value,
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
  } catch {
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

const densityOptions = [
  { value: 'standard', label: $t('settings.menu_density_standard') },
  { value: 'compact', label: $t('settings.menu_density_compact') },
];

const navItems: { id: Tab; icon: Component; label: string }[] = [
  { id: 'general', icon: Languages, label: $t('settings.tab_general') },
  { id: 'keyboard', icon: Keyboard, label: $t('settings.tab_keyboard') },
  { id: 'menu', icon: PanelLeft, label: $t('settings.tab_menu') },
];
</script>

<template>
  <div
    class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm px-4"
    @click.self="emit('close')"
  >
    <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[80vh]">

      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
        <div class="flex items-center gap-2.5">
          <Settings :size="17" class="text-blue-500 dark:text-blue-400" />
          <h2 class="font-semibold text-slate-900 dark:text-slate-100 text-sm">{{ $t('settings.title') }}</h2>
        </div>
        <button
          @click="emit('close')"
          class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
        >
          <X :size="16" />
        </button>
      </div>

      <!-- Body: sidebar + content -->
      <div class="flex flex-1 min-h-0">

        <!-- Left nav -->
        <nav class="w-44 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 p-2 space-y-0.5 rounded-bl-xl">
          <button
            v-for="item in navItems"
            :key="item.id"
            @click="activeTab = item.id"
            class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left"
            :class="activeTab === item.id
              ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-200'"
          >
            <component :is="item.icon" :size="15" class="flex-shrink-0" />
            {{ item.label }}
          </button>
        </nav>

        <!-- Content -->
        <div class="flex-1 overflow-y-auto p-6">

          <!-- General -->
          <template v-if="activeTab === 'general'">
            <div class="space-y-5">
              <div>
                <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  {{ $t('settings.language_label') }}
                </label>
                <AppSelect v-model="language" :options="languageOptions" />
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  {{ $t('settings.theme_label') }}
                </label>
                <AppSelect v-model="theme" :options="themeOptions" />
              </div>
            </div>
          </template>

          <!-- Keyboard -->
          <template v-if="activeTab === 'keyboard'">
            <div class="space-y-4">
              <div class="flex items-center justify-between gap-4">
                <span class="text-sm text-slate-600 dark:text-slate-300 flex-1">{{ $t('settings.hotkey_close_tab') }}</span>
                <div class="w-44 flex-shrink-0"><HotkeyInput v-model="hotkeyCloseTab" /></div>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-sm text-slate-600 dark:text-slate-300 flex-1">{{ $t('settings.hotkey_execute_all') }}</span>
                <div class="w-44 flex-shrink-0"><HotkeyInput v-model="hotkeyExecuteAll" /></div>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-sm text-slate-600 dark:text-slate-300 flex-1">{{ $t('settings.hotkey_execute_statement') }}</span>
                <div class="w-44 flex-shrink-0"><HotkeyInput v-model="hotkeyExecuteStatement" /></div>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span class="text-sm text-slate-600 dark:text-slate-300 flex-1">{{ $t('settings.hotkey_new_tab') }}</span>
                <div class="w-44 flex-shrink-0"><HotkeyInput v-model="hotkeyNewTab" /></div>
              </div>
            </div>
          </template>

          <!-- Menu -->
          <template v-if="activeTab === 'menu'">
            <div class="space-y-5">
              <div>
                <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  {{ $t('settings.menu_density_label') }}
                </label>
                <AppSelect v-model="menuDensity" :options="densityOptions" />
              </div>
            </div>
          </template>

        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 rounded-b-xl flex-shrink-0">
        <BaseButton variant="text" size="sm" @click="emit('close')">
          {{ $t('common.cancel') }}
        </BaseButton>
        <BaseButton variant="primary" size="sm" @click="handleSave">
          {{ $t('common.save') }}
        </BaseButton>
      </div>

    </div>
  </div>
</template>
