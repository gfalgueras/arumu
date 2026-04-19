<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { ChevronDown, ChevronUp, Trash2, GripHorizontal, AlertCircle, CheckCircle, Info, AlertTriangle, ArrowDownNarrowWide, ArrowUpNarrowWide } from 'lucide-vue-next';
import { logEntries, clearLogs, type LogLevel, type QueryType } from '../logService';

const collapsed = ref(false);
const height = ref(160);
const isResizing = ref(false);
const scrollRef = ref<HTMLElement | null>(null);
const newestFirst = ref(true);
const autoScroll = ref(true);

const displayedEntries = computed(() =>
  newestFirst.value ? [...logEntries].reverse() : logEntries
);

const startResize = (e: MouseEvent) => {
  e.preventDefault();
  isResizing.value = true;
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
};

const onMouseMove = (e: MouseEvent) => {
  if (!isResizing.value) return;
  const newHeight = window.innerHeight - e.clientY;
  height.value = Math.max(80, Math.min(newHeight, window.innerHeight * 0.6));
};

const onMouseUp = () => {
  isResizing.value = false;
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
};

onUnmounted(() => {
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
});

// Autoscroll when new entries arrive (only in oldest-first mode)
watch(logEntries, async () => {
  if (newestFirst.value || !autoScroll.value || collapsed.value) return;
  await nextTick();
  if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
}, { deep: true });

// Reset scroll position when toggling sort order
watch(newestFirst, async (val) => {
  await nextTick();
  if (!scrollRef.value) return;
  scrollRef.value.scrollTop = val ? 0 : scrollRef.value.scrollHeight;
});

const levelIcon = (level: LogLevel) => {
  if (level === 'error') return AlertCircle;
  if (level === 'warn') return AlertTriangle;
  if (level === 'success') return CheckCircle;
  return Info;
};

const levelClass = (level: LogLevel) => {
  if (level === 'error') return 'text-red-500 dark:text-red-400';
  if (level === 'warn') return 'text-amber-500 dark:text-amber-400';
  if (level === 'success') return 'text-emerald-500 dark:text-emerald-400';
  return 'text-blue-500 dark:text-blue-400';
};

const rowClass = (level: LogLevel, queryType?: QueryType) => {
  if (level === 'error') {
    if (queryType === 'update') return 'bg-amber-50/80 dark:bg-amber-900/20 hover:bg-amber-100/80 dark:hover:bg-amber-900/30 border-l-2 border-amber-400';
    if (queryType === 'delete') return 'bg-red-50/80 dark:bg-red-900/20 hover:bg-red-100/80 dark:hover:bg-red-900/30 border-l-2 border-red-500';
    return 'bg-red-50/50 dark:bg-red-900/10 hover:bg-red-100/50 dark:hover:bg-red-900/20';
  }
  if (level === 'warn') return 'bg-amber-50/50 dark:bg-amber-900/10 hover:bg-amber-100/50 dark:hover:bg-amber-900/20';
  if (level === 'success') return 'bg-emerald-50/50 dark:bg-emerald-900/10 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20';
  // info level — style by query type
  if (queryType === 'update') return 'bg-amber-50/40 dark:bg-amber-900/10 hover:bg-amber-100/50 dark:hover:bg-amber-900/20 border-l-2 border-amber-400';
  if (queryType === 'delete') return 'bg-rose-50/40 dark:bg-rose-900/10 hover:bg-rose-100/50 dark:hover:bg-rose-900/20 border-l-2 border-rose-400';
  if (queryType === 'insert') return 'bg-emerald-50/30 dark:bg-emerald-900/10 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/20 border-l-2 border-emerald-400';
  return 'hover:bg-slate-50 dark:hover:bg-slate-800/40';
};

const queryTypeBadge = (queryType?: QueryType) => {
  if (queryType === 'update') return { label: 'UPD', cls: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' };
  if (queryType === 'delete') return { label: 'DEL', cls: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400' };
  if (queryType === 'insert') return { label: 'INS', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400' };
  return null;
};

const formatTime = (d: Date) => d.toTimeString().slice(0, 8);
</script>

<template>
  <div
    class="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col"
    :class="isResizing ? 'select-none' : ''"
    :style="collapsed ? {} : { height: height + 'px' }"
  >
    <!-- Resize handle -->
    <div
      v-if="!collapsed"
      class="h-3 flex items-center justify-center cursor-row-resize group flex-shrink-0"
      @mousedown="startResize"
    >
      <div class="w-full h-px bg-slate-200 dark:bg-slate-700 group-hover:bg-blue-500 transition-colors relative flex items-center justify-center">
        <div class="absolute bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5 group-hover:border-blue-500 transition-colors">
          <GripHorizontal :size="10" class="text-slate-400 dark:text-slate-500 group-hover:text-blue-500" />
        </div>
      </div>
    </div>

    <!-- Header -->
    <div class="flex items-center gap-2 px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
      <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Log</span>
      <span
        v-if="logEntries.length > 0"
        class="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded"
      >
        {{ logEntries.length }}
      </span>

      <div class="ml-auto flex items-center gap-1">
        <!-- Autoscroll — only visible in oldest-first mode -->
        <label
          v-if="!newestFirst"
          class="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 cursor-pointer select-none mr-1"
        >
          <input type="checkbox" v-model="autoScroll" class="w-3 h-3 accent-blue-500" />
          auto-scroll
        </label>

        <!-- Sort order toggle -->
        <button
          @click="newestFirst = !newestFirst"
          class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
          :title="newestFirst ? 'Mostrando más nuevos primero' : 'Mostrando más antiguos primero'"
        >
          <ArrowDownNarrowWide v-if="newestFirst" :size="13" />
          <ArrowUpNarrowWide v-else :size="13" />
        </button>

        <button
          @click="clearLogs()"
          class="p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors rounded hover:bg-slate-100 dark:hover:bg-slate-700"
          title="Clear logs"
        >
          <Trash2 :size="12" />
        </button>
        <button
          @click="collapsed = !collapsed"
          class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded hover:bg-slate-100 dark:hover:bg-slate-700"
          :title="collapsed ? 'Expand log' : 'Collapse log'"
        >
          <ChevronUp v-if="!collapsed" :size="14" />
          <ChevronDown v-else :size="14" />
        </button>
      </div>
    </div>

    <!-- Log entries -->
    <div
      v-if="!collapsed"
      ref="scrollRef"
      class="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent font-mono text-xs"
    >
      <div
        v-if="displayedEntries.length === 0"
        class="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 italic text-[11px]"
      >
        No log entries yet
      </div>
      <div
        v-for="entry in displayedEntries"
        :key="entry.id"
        class="flex items-start gap-2 px-3 py-1 border-b border-slate-100 dark:border-slate-800/50 transition-colors"
        :class="rowClass(entry.level, entry.queryType)"
      >
        <component
          :is="levelIcon(entry.level)"
          :size="11"
          class="flex-shrink-0 mt-0.5"
          :class="levelClass(entry.level)"
        />
        <span class="text-slate-400 dark:text-slate-500 flex-shrink-0 tabular-nums">{{ formatTime(entry.ts) }}</span>
        <span
          v-if="queryTypeBadge(entry.queryType)"
          :class="queryTypeBadge(entry.queryType)!.cls"
          class="flex-shrink-0 text-[9px] font-bold px-1 py-0.5 rounded font-mono tracking-wide"
        >{{ queryTypeBadge(entry.queryType)!.label }}</span>
        <span class="text-slate-700 dark:text-slate-300 break-all">{{ entry.message }}</span>
        <span v-if="entry.detail" class="text-slate-500 dark:text-slate-400 break-all ml-1">— {{ entry.detail }}</span>
      </div>
    </div>
  </div>
</template>
