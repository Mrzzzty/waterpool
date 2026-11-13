import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { entries: ['index.html'] },
  server: { watch: { ignored: ['**/archive/**', '**/.work-backup/**', '**/research/upstream/**', '**/research/snapshots/**'] } },
  build: { chunkSizeWarningLimit: 1500 },
})
