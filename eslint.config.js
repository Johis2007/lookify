// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // .kilo contiene worktrees de git (copias duplicadas del repo):
    // si se escanean, eslint reporta cientos de errores fantasma.
    // El lint de cada app corre desde su workspace.
    ignores: ["dist/*", ".kilo/**", "apps/*/dist/**", "directus/**", ".expo/**"],
  }
]);
