import { createNodeConfig } from "@template/eslint-config/node";
import { createNextConfig } from "@template/eslint-config/next";

const baseConfig = createNextConfig({
  tsconfigRootDir: import.meta.dirname,
  allowDefaultProject: ["vitest.config.ts"],
});

// The browser harness runs in Node, not in the browser. The Node runtime
// globals are reused from the shared node configuration so the harness files
// keep the same runtime coverage the API package has.
const nodeGlobals = createNodeConfig({
  tsconfigRootDir: import.meta.dirname,
})
  .map((entry) => entry.languageOptions?.globals)
  .find((globals) => globals !== undefined);

const eslintConfig = [
  ...baseConfig,
  {
    // The Playwright configuration and the harness helpers are checked against
    // their own strict project boundary, so they never enter the application
    // program. The strict typed rules stay in force.
    files: ["playwright.config.ts", "e2e/**/*.ts"],
    languageOptions: {
      ...(nodeGlobals === undefined ? {} : { globals: nodeGlobals }),
      parserOptions: {
        projectService: false,
        project: "./tsconfig.e2e.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];

export default eslintConfig;
