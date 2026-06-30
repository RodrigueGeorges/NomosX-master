import nextConfig from "eslint-config-next";

// eslint-config-next v16 ships a flat-config array. Normalize CJS/ESM interop.
const nextFlat = Array.isArray(nextConfig) ? nextConfig : nextConfig.default;

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      "**/*.mjs",
      "**/*.cjs",
      "scripts/**",
      "backups/**",
      "cypress/**",
      "**/__tests__/**",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
  },
  ...nextFlat,
  {
    // React Compiler heuristic: syncing external state (URL params, localStorage)
    // into React state via effects is idiomatic and SSR-safe here. Keep as warning.
    files: ["**/*.{ts,tsx,jsx}"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
