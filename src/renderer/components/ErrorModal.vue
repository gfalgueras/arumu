<script setup lang="ts">
import { AlertCircle, X } from 'lucide-vue-next';
import { errorState, hideError } from '../errorService';
</script>

<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <div v-if="errorState.show" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] backdrop-blur-sm px-4" @click.self="hideError">
      <div class="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-500/50 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl shadow-red-500/10 dark:shadow-red-500/20">
        <div class="p-4 border-b border-red-100 dark:border-slate-800 flex justify-between items-center bg-red-50 dark:bg-red-500/5">
          <div class="flex items-center gap-3 text-red-600 dark:text-red-400">
            <AlertCircle :size="20" />
            <h2 class="text-lg font-bold">{{ errorState.title }}</h2>
          </div>
          <button @click="hideError" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-100 transition-colors p-1 hover:bg-red-100 dark:hover:bg-slate-800 rounded">
            <X :size="20" />
          </button>
        </div>

        <div v-if="errorState.message" class="p-6">
          <div class="bg-slate-50 dark:bg-slate-950 border border-red-100 dark:border-slate-800 rounded-lg p-4 font-mono text-sm text-red-800 dark:text-red-200/80 break-words whitespace-pre-wrap max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-red-200 dark:scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {{ errorState.message }}
          </div>
        </div>

      </div>
    </div>
  </Transition>
</template>
