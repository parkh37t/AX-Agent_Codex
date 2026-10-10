import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({
  ...base,
  outputDir: join(tmpdir(), 'ax-local-review-results'),
  testMatch: "studio.spec.ts",
  use: { ...base.use, baseURL: 'http://127.0.0.1:5183' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5183 --strictPort',
    url: 'http://127.0.0.1:5183',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
