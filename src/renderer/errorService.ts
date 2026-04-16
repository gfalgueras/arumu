import { reactive } from 'vue';

interface ErrorState {
  show: boolean;
  title: string;
  message: string;
}

export const errorState = reactive<ErrorState>({
  show: false,
  title: '',
  message: '',
});

export function showError(title: string, message: string) {
  errorState.title = title;
  errorState.message = message;
  errorState.show = true;
}

export function hideError() {
  errorState.show = false;
}
