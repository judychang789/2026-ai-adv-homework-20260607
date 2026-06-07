const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'tests/e2e/screenshots',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3001',
    headless: false,
    screenshot: 'on',
    video: 'on',
    trace: 'retain-on-failure',
    actionTimeout: 60000,
    navigationTimeout: 60000,
  },
  reporter: [['list'], ['html', { outputFolder: 'tests/e2e/report', open: 'never' }]],
});
