import { defineConfig } from '@playwright/test';

// Agent/Node hosts may export this; GUI tests and second invocations need Electron mode.
delete process.env.ELECTRON_RUN_AS_NODE;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/e2e',
  workers: 1,
  timeout: 30_000,
  use: { trace: 'retain-on-failure' },
});
