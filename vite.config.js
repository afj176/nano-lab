import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build works from a GitHub Pages project URL (username.github.io/repo/)
  // as well as from a domain root.
  base: './',
  worker: { format: 'es' },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
