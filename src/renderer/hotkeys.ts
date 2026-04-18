import { reactive } from 'vue';

export interface HotkeyMap {
  closeTab: string;
  executeAll: string;
  executeStatement: string;
  newTab: string;
}

export const defaultHotkeys: HotkeyMap = {
  closeTab: 'Shift+W',
  executeAll: 'F9',
  executeStatement: 'Shift+F9',
  newTab: 'Ctrl+T',
};

export const hotkeys = reactive<HotkeyMap>({ ...defaultHotkeys });

export const applyHotkeys = (saved: Partial<HotkeyMap> = {}) => {
  Object.assign(hotkeys, defaultHotkeys, saved);
};

export const matchesHotkey = (e: KeyboardEvent, combo: string): boolean => {
  if (!combo) return false;
  const parts = combo.split('+');
  const key = parts[parts.length - 1];
  const needsCtrl = parts.includes('Ctrl');
  const needsShift = parts.includes('Shift');
  const needsAlt = parts.includes('Alt');
  return (
    e.key.toUpperCase() === key.toUpperCase() &&
    e.ctrlKey === needsCtrl &&
    e.shiftKey === needsShift &&
    e.altKey === needsAlt
  );
};

export const toCodeMirrorKey = (combo: string): string =>
  combo.replace(/\+/g, '-');
