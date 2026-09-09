import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: [
    "eslint",
    "typescript",
    "unicorn",
    "react",
    "react-perf",
    "oxc",
    "import",
    "jsdoc",
  ],
  categories: {
    correctness: "warn",
  },
  rules: {
    "eslint/no-unused-vars": "warn",
  },
});
