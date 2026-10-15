// src/theme/fonts.ts
// Punto de entrada de la fuente web. En runtime Metro elige:
// - fonts.web.ts en web (inyecta Plus Jakarta Sans por Google Fonts, sin key)
// - este archivo en iOS/Android (noop: se usa la fuente del sistema).
export function ensureWebFont(): void {
  /* noop en nativo */
}
