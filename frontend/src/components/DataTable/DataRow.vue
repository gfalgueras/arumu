<script setup lang="ts">
const props = defineProps<{
  row: any;
  columns: string[];
}>();

const formatCellValue = (val: any) => {
  if (val === null) return 'NULL';
  
  // Detect ISO date strings and format them
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
    return val.replace('T', ' ').replace(/\.\d+Z$/, '').replace('Z', '');
  }
  
  return String(val);
};

const isNull = (val: any) => val === null;
</script>

<template>
  <tr class="hover:bg-slate-100 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/50 last:border-0 transition-colors">
    <td 
      v-for="col in columns"
      :key="col" 
      class="px-4 py-1.5 text-sm text-slate-700 dark:text-slate-300 truncate border-r border-slate-100 dark:border-slate-800/30 last:border-r-0"
    >
      <span v-if="isNull(row[col])" class="text-slate-400 dark:text-slate-600 italic text-xs">NULL</span>
      <template v-else>{{ formatCellValue(row[col]) }}</template>
    </td>
  </tr>
</template>
