import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    environment: "node",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    globalSetup: ["./tests/integration/global-setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    pool: "forks",
    maxWorkers: 1,
    // The files share one process so that every file's setup and teardown runs
    // to completion before the next file starts. A forked process per file lets
    // one file's teardown truncate the rows of the next file.
    isolate: false,
  },
});
