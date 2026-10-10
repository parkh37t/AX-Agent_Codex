import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({
  ...base,
  outputDir: join(tmpdir(), 'ax-pages-review-results'),
  testMatch: 'pages.spec.ts',
  use: { ...base.use, baseURL: 'http://127.0.0.1:5184/AX-Agent_Codex/' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 5184 --strictPort --base /AX-Agent_Codex/',
    url: 'http://127.0.0.1:5184/AX-Agent_Codex/',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
