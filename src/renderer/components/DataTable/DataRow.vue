<script setup lang="ts">
import { Pencil, Trash2, Check, X } from 'lucide-vue-next';

interface EditCell {
  value: string;
  isNull: boolean;
}

const props = defineProps<{
  row: any;
  columns: string[];
  rowIndex: number;
  isEditing?: boolean;
  editValues?: Record<string, EditCell>;
  canEdit?: boolean;
}>();

const emit = defineEmits<{
  (e: 'startEdit', index: number): void;
  (e: 'saveEdit', index: number): void;
  (e: 'cancelEdit'): void;
  (e: 'deleteRow', index: number): void;
  (e: 'updateCell', col: string, value: string, isNull: boolean): void;
}>();

const formatCellValue = (val: any) => {
  if (val === null) return 'NULL';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
    return val.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');
  }
  return String(val);
};
</script>

<template>
  <tr
    class="border-b border-slate-100 dark:border-slate-800/50 last:border-0 transition-colors group/row"
    :class="isEditing ? 'bg-blue-50/50 dark:bg-blue-500/5' : 'hover:bg-slate-100 dark:hover:bg-slate-800/40'"
  >
    <!-- Data cells -->
    <td
      v-for="col in columns"
      :key="col"
      class="px-2 py-1 text-sm border-r border-slate-100 dark:border-slate-800/30 last:border-r-0"
    >
      <!-- Edit mode -->
      <template v-if="isEditing && editValues">
        <div class="flex items-center gap-1">
          <input
            v-if="!editValues[col]?.isNull"
            :value="editValues[col]?.value ?? ''"
            @input="emit('updateCell', col, ($event.target as HTMLInputElement).value, false)"
            class="w-full min-w-0 px-1.5 py-0.5 text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span v-else class="text-slate-400 dark:text-slate-600 italic text-xs px-1">NULL</span>
          <button
            type="button"
            @click="emit('updateCell', col, '', !editValues[col]?.isNull)"
            :title="editValues[col]?.isNull ? 'Set value' : 'Set NULL'"
            class="shrink-0 text-[10px] px-1 py-0.5 rounded border transition-colors"
            :class="editValues[col]?.isNull
              ? 'border-orange-400 text-orange-500 bg-orange-50 dark:bg-orange-500/10 hover:bg-orange-100'
              : 'border-slate-300 dark:border-slate-600 text-slate-400 hover:text-orange-500 hover:border-orange-400'"
          >NULL</button>
        </div>
      </template>
      <!-- Display mode -->
      <template v-else>
        <span v-if="row[col] === null" class="text-slate-400 dark:text-slate-600 italic text-xs">NULL</span>
        <template v-else>
          <span class="text-slate-700 dark:text-slate-300 truncate block">{{ formatCellValue(row[col]) }}</span>
        </template>
      </template>
    </td>

    <!-- Action column -->
    <td class="px-2 py-1 text-sm w-[70px] shrink-0">
      <div class="flex items-center gap-0.5 justify-end">
        <template v-if="isEditing">
          <button
            @click="emit('saveEdit', rowIndex)"
            class="p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 rounded transition-colors"
            title="Save"
          >
            <Check :size="14" />
          </button>
          <button
            @click="emit('cancelEdit')"
            class="p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
            title="Cancel"
          >
            <X :size="14" />
          </button>
        </template>
        <template v-else-if="canEdit">
          <button
            @click="emit('startEdit', rowIndex)"
            class="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-colors opacity-0 group-hover/row:opacity-100"
            title="Edit"
          >
            <Pencil :size="13" />
          </button>
          <button
            @click="emit('deleteRow', rowIndex)"
            class="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-colors opacity-0 group-hover/row:opacity-100"
            title="Delete"
          >
            <Trash2 :size="13" />
          </button>
        </template>
      </div>
    </td>
  </tr>
</template>
