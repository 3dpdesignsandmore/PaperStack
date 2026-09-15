// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // The repo's `const`-object + `type X = (typeof X)[keyof typeof X]`
    // pattern (CLAUDE.md TypeScript conventions) intentionally reuses one
    // name for the runtime object and its type. TypeScript itself already
    // rejects genuine accidental redeclarations in the same scope — this
    // rule's only remaining false positive here is that intentional
    // pattern (its `ignoreDeclarationMerge` option doesn't recognize a
    // value+type-alias pair as a merge, only namespace/interface cases).
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-redeclare": "off",
    },
  },
]);
