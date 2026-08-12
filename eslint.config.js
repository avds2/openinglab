import js from "@eslint/js";

const browserGlobals = {
  Blob: "readonly",
  URL: "readonly",
  TextEncoder: "readonly",
  document: "readonly",
  history: "readonly",
  localStorage: "readonly",
  location: "readonly",
  matchMedia: "readonly",
  navigator: "readonly",
  performance: "readonly",
  getComputedStyle: "readonly",
  window: "readonly",
};

const workerGlobals = {
  Request: "readonly",
  Response: "readonly",
  URL: "readonly",
  caches: "readonly",
  fetch: "readonly",
  self: "readonly",
};

const nodeGlobals = {
  Buffer: "readonly",
  URL: "readonly",
  console: "readonly",
  process: "readonly",
  structuredClone: "readonly",
};

export default [
  { ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**", "sw.template.js"] },
  js.configs.recommended,
  {
    files: ["js/**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: browserGlobals },
    rules: { "no-unused-vars": ["error", { argsIgnorePattern: "^_" }] },
  },
  {
    files: ["sw.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "script", globals: workerGlobals },
  },
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "eslint.config.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: nodeGlobals },
  },
  {
    files: ["playwright.config.js", "tests/e2e/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...nodeGlobals, ...browserGlobals, caches: "readonly" },
    },
  },
];
