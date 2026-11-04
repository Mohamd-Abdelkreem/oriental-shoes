import { createNodeConfig } from "@template/eslint-config/node";

const baseConfig = createNodeConfig({
  tsconfigRootDir: import.meta.dirname,
  allowDefaultProject: [
    "vitest.config.ts",
    "vitest.integration.config.ts",
    "vitest.setup.ts",
  ],
});

const eslintConfig = [
  ...baseConfig,
  {
    // The disposable API child of the browser harness is checked against its
    // own strict project boundary, so it never enters the production program.
    // The strict typed rules and the Node runtime globals stay in force.
    files: ["tests/e2e/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: "./tsconfig.e2e.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];

export default eslintConfig;
