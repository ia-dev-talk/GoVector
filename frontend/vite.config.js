import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	plugins: [react()],
	build: {
		rollupOptions: {
			output: {
				manualChunks: {
					// AG Grid séparé (le plus lourd)
					'ag-grid': ['ag-grid-community', 'ag-grid-react'],
					// Leaflet pour la carte
					leaflet: ['leaflet', 'react-leaflet'],
					// Vendor React
					vendor: ['react', 'react-dom'],
				},
			},
		},
		chunkSizeWarningLimit: 500,
	},
	server: {
		proxy: {
			'/api': {
				target: 'http://localhost:8080',
				changeOrigin: true,
				ws: true,
			},
		},
	},
});