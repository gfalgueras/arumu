import { createApp } from 'vue'
import './index.css'
import App from './App.vue'

// Soporte para serializar BigInt en JSON (necesario para datos de bases de datos)
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

createApp(App).mount('#root')
