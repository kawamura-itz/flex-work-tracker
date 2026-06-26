import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base ('./') makes the built assets work both under a GitHub Pages
// project path (username.github.io/flex-work-tracker/) and a custom domain at
// root. Combined with hash routing this avoids the GitHub Pages 404 problem
// for client-side routes entirely.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
