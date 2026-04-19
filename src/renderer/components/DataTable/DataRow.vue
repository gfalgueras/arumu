<script setup lang="ts">
interface EditCell { value: string; isNull: boolean; }

const props = defineProps<{
  row: any;
  columns: string[];
  rowIndex: number;
  selectedCol: string | null;
  editingCol: string | null;
  editingValue: EditCell;
  canEdit: boolean;
}>();

const emit = defineEmits<{
  (e: 'selectCell', col: string): void;
  (e: 'openContextMenu', col: string, event: MouseEvent): void;
  (e: 'startEditCell', col: string): void;
  (e: 'updateEditValue', value: string, isNull: boolean): void;
  (e: 'saveEdit'): void;
  (e: 'cancelEdit'): void;
}>();

const formatCellValue = (val: any): string => {
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
    return val.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');
  }
  return String(val);
};
</script>

<template>
  <tr
    class="border-b border-slate-100 dark:border-slate-800/50 last:border-0 transition-colors"
    :class="selectedCol !== null ? 'bg-blue-50/20 dark:bg-blue-500/5' : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'"
  >
    <td
      v-for="col in columns"
      :key="col"
      class="border-r border-slate-100 dark:border-slate-800/30 last:border-r-0 cursor-default select-none"
      :class="[
        editingCol === col ? 'p-0' : 'px-2 py-1',
        selectedCol === col && editingCol !== col
          ? 'ring-1 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-500/10'
          : '',
      ]"
      @click.stop="emit('selectCell', col)"
      @contextmenu.prevent="emit('openContextMenu', col, $event)"
      @dblclick.stop="canEdit && emit('startEditCell', col)"
    >
      <!-- Edit mode -->
      <template v-if="editingCol === col">
        <input
          :value="editingValue.isNull ? '' : editingValue.value"
          @input="emit('updateEditValue', ($event.target as HTMLInputElement).value, false)"
          @keydown.enter.prevent="emit('saveEdit')"
          @keydown.escape.prevent="emit('cancelEdit')"
          :ref="(el) => { if (el) (el as HTMLInputElement).focus(); }"
          class="w-full h-full min-h-[30px] px-2 py-1 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none ring-2 ring-inset ring-blue-500"
        />
      </template>
      <!-- Display mode -->
      <template v-else>
        <span v-if="row[col] === null" class="text-slate-400 dark:text-slate-600 italic text-xs">NULL</span>
        <span v-else class="text-slate-700 dark:text-slate-300 truncate block text-xs">{{ formatCellValue(row[col]) }}</span>
      </template>
    </td>
  </tr>
</template>
