import { ref } from 'vue';

// Session-only — resets on app restart
export const skipUpdateConfirm = ref(false);
export const skipDeleteConfirm = ref(false);
