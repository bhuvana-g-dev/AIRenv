import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked, jsxA11y.flatConfigs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: {
      // Treat the design-system wrappers as their native elements so a11y rules apply to them.
      "jsx-a11y": { components: { Button: "button" } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports", fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-floating-promises": "error",
      // React event props accept functions returning void; passing an async handler there is intended.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      // `x == null` is the idiomatic "null or undefined" check; everything else must be strict.
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["error", "warn"] }],
      "prefer-const": "error",
    },
  },
  {
    // Tests and test utilities: export helpers alongside components, and work with loosely
    // typed mocks / DOM fixtures where the unsafe-* checks add noise rather than safety.
    files: ["src/test/**", "**/*.test.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/unbound-method": "off",
    },
  },
  {
    // Build tooling config lives outside the app tsconfig; lint it without type information.
    files: ["*.config.{js,ts}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  // Must stay last: turns off stylistic rules that would fight with Prettier.
  prettier,
);
