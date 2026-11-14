import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages project sites live under /<repo>/, so the deploy workflow sets BASE_PATH.
  // Root-domain hosts (Netlify, Vercel, custom domains) keep the default "/".
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
