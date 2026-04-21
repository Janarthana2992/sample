import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/api/auth': { target: 'http://localhost:8001', rewrite: path => path.replace(/^\/api\/auth/, ''), changeOrigin: true },
            '/api/products': { target: 'http://localhost:8002', rewrite: path => path.replace(/^\/api\/products/, ''), changeOrigin: true },
            '/api/cart': { target: 'http://localhost:8003', rewrite: path => path.replace(/^\/api\/cart/, ''), changeOrigin: true },
            '/api/orders': { target: 'http://localhost:8004', rewrite: path => path.replace(/^\/api\/orders/, ''), changeOrigin: true },
            '/api/ai': { target: 'http://localhost:8005', rewrite: path => path.replace(/^\/api\/ai/, ''), changeOrigin: true },
            '/ws': { target: 'ws://localhost:8005', ws: true, changeOrigin: true },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
    },
})
