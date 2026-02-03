<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import CodeMirror from 'vue-codemirror6';
import { sql, MySQL, PostgreSQL, SQLite } from '@codemirror/lang-sql';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap, EditorView } from '@codemirror/view';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { Search } from 'lucide-vue-next';
import { $t } from '../../i18n';

const props = defineProps<{
  initialValue: string;
  isLoading?: boolean;
  serverType: 'mysql' | 'postgres' | 'sqlite';
  columns: string[];
  table: string;
}>();

const emit = defineEmits<{
  (e: 'apply', value: string): void;
}>();

const value = ref(props.initialValue);

watch(() => props.initialValue, (newVal) => {
  if (newVal !== value.value) {
    value.value = newVal;
  }
});

const extensions = computed(() => {
  const dialect = props.serverType === 'postgres' ? PostgreSQL : 
                  props.serverType === 'sqlite' ? SQLite : MySQL;
  
  const schema: Record<string, string[]> = {};
  if (props.columns.length > 0 && props.table) {
    schema[props.table] = props.columns;
  }

  return [
    sql({ 
      dialect, 
      schema,
      upperCaseKeywords: true
    }),
    oneDark,
    autocompletion({ activateOnTyping: true }),
    // Add columns as global completions for the filter input
    dialect.language.data.of({
      autocomplete: (context: any) => {
        const word = context.matchBefore(/\w*/);
        if (!word || (word.from == word.to && !context.explicit)) return null;
        return {
          from: word.from,
          options: props.columns.map(col => ({ label: col, type: "property", boost: 10 }))
        };
      }
    }),
    EditorState.transactionFilter.of(tr => tr.docChanged && tr.newDoc.lines > 1 ? [] : tr),
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        fontSize: "12px",
        height: "30px",
      },
      ".cm-scroller": {
        overflow: "hidden",
        display: "flex",
        alignItems: "center"
      },
      ".cm-content": {
        padding: "0 8px 0 30px", // Extra padding for Search icon
      },
      ".cm-line": {
        padding: "0",
        lineHeight: "28px"
      },
      "&.cm-focused": {
        outline: "none"
      },
      ".cm-gutters": {
        display: "none"
      },
      ".cm-activeLine": {
        backgroundColor: "transparent !important"
      }
    }),
    keymap.of([
      ...completionKeymap,
      {
        key: "Enter",
        run: (view) => {
          emit('apply', value.value);
          view.contentDOM.blur();
          return true;
        }
      }
    ])
  ];
});
</script>

<template>
  <div class="relative group flex items-center">
    <Search 
      class="absolute left-2.5 z-10 text-slate-400 group-focus-within:text-blue-500 transition-colors" 
      :size="14" 
    />
    <div 
      class="bg-white dark:bg-[#282c34] border border-slate-300 dark:border-slate-700 rounded overflow-hidden focus-within:ring-1 focus-within:ring-blue-500 w-64 md:w-80 lg:w-96 transition-all shadow-sm"
      :class="{ 'opacity-50 pointer-events-none': isLoading }"
    >
      <CodeMirror
        v-model="value"
        :extensions="extensions"
        :basic-setup="{ 
          lineNumbers: false,
          foldGutter: false,
          highlightActiveLine: false,
          highlightSelectionMatches: true,
          drawSelection: true,
          dropCursor: true,
          allowMultipleSelections: false,
          indentOnInput: false,
          bracketMatching: true,
          autocompletion: true
        }"
        :placeholder="$t('data_table.filter_placeholder')"
        class="text-xs font-mono"
      />
    </div>
  </div>
</template>

<style scoped>
:deep(.cm-editor) {
  background-color: transparent !important;
}
:deep(.cm-placeholder) {
  font-style: italic;
  color: #6b7280;
}
</style>
