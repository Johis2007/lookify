// src/theme/fonts.web.ts
// Variante web: carga Plus Jakarta Sans (400/600/700/800) por Google Fonts
// una sola vez. Sin API key. Las pantallas la consumen vía
// `fontFamily` de theme/colors.ts (Platform.select web).
import { fontFamily } from './colors';

let injected = false;

export function ensureWebFont(): void {
  if (injected || typeof document === 'undefined') return;
  if (document.querySelector('link[data-lookify-font]')) {
    injected = true;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap';
  link.setAttribute('data-lookify-font', '1');
  document.head.appendChild(link);
  injected = true;
}

export { fontFamily };
