import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 80,
  sortImports: {
    newlinesBetween: true,
    customGroups: [
      {
        groupName: "react",
        selector: "external",
        elementNamePattern: ["react", "react/*"],
      },
      {
        groupName: "vite",
        selector: "external",
        elementNamePattern: ["vite", "@vitejs/*"],
      },
      {
        groupName: "tanstack",
        selector: "external",
        elementNamePattern: ["@tanstack/**"],
      },
      {
        groupName: "components-primitives",
        selector: "internal",
        elementNamePattern: ["@/components/primitives/**"],
      },
      {
        groupName: "components-composites",
        selector: "internal",
        elementNamePattern: ["@/components/composites/**"],
      },
      {
        groupName: "components-layout",
        selector: "internal",
        elementNamePattern: ["@/components/layout/**"],
      },
      {
        groupName: "components-effects",
        selector: "internal",
        elementNamePattern: ["@/components/effects/**"],
      },
      // assets before internal-other so it isn't swallowed by @/**
      {
        groupName: "assets",
        selector: "internal",
        elementNamePattern: ["@/assets/**"],
      },
      {
        groupName: "internal-other",
        selector: "internal",
        elementNamePattern: ["@/**"],
      },
      {
        groupName: "material-symbols",
        selector: "external",
        elementNamePattern: ["@material-symbols/**"],
      },
    ],
    groups: [
      "builtin",
      "react",
      "vite",
      "tanstack",
      "external",
      "components-primitives",
      "components-composites",
      "components-layout",
      "components-effects",
      "internal-other",
      ["parent", "sibling", "index"],
      "material-symbols",
      "style",
      "assets",
      "unknown",
    ],
  },
  sortTailwindcss: {
    stylesheet: "src/styles/globals.css",
    functions: ["cn", "twMerge", "tw", "clsx", "cva"],
  },
  jsdoc: {
    descriptionWithDot: true,
    preferCodeFences: true,
  },
});
