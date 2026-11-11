import { defineConfig } from 'vite';

// Relative base so the static build works from any path (GitHub Pages, S3, file share).
export default defineConfig({ base: './' });
