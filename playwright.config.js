import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './tests/ui',
    timeout: 30000,
    retries: 0,
    use: {
        baseURL: 'http://localhost:3111',
        headless: true,
    },
    webServer: {
        command: 'node tests/ui/server-harness.js',
        port: 3111,
        reuseExistingServer: false,
        timeout: 10000,
    },
});
