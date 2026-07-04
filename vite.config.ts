import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // IMPORTANT: Replace this with your actual GitHub repository name!
  // Example: if your repo is github.com/username/my-portfolio, use '/my-portfolio/'
  base: '/CV/', 
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: 'all'
  }
});
