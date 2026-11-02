// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', 'functions/*/node_modules/*'] },
  // The Appwrite Function and the scripts run in Node, not the app.
  { files: ['functions/**/*.js', 'scripts/**/*.mjs'], languageOptions: { globals: globals.node } },
  // React Compiler advice (not runtime bugs). Kept visible as warnings while the
  // existing hooks are migrated; new code should follow them.
  {
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
]);
