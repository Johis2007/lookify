// Sincroniza apps/mobile-web/.env con las IPs LAN conocidas (multi-red).
//
// La app queda compilada con EXPO_PUBLIC_*; si el Wi-Fi cambia de IP (DHCP,
// casa <-> universidad), la URL primaria deja de responder. Por eso se guardan
// TODAS las redes conocidas como listas de fallback y el cliente (lib/endpoints)
// prueba cada una con health-check hasta encontrar la que responde:
//
//   npm run env:lan [IP-primaria] [IP-secundaria ...]
//   npm run env:lan                      -> autodetecta la primaria
//   npm run env:lan 192.168.1.8 10.157.39.169
//
// Las IPs ya presentes en el .env se conservan (no se pierde la red de la
// universidad al sincronizar en casa, ni viceversa). Después reinicia el dev
// server:  npm run dev:app
import { networkInterfaces, hostname } from 'node:os';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, 'apps', 'mobile-web', '.env');

function currentLanIp() {
  const ifaces = networkInterfaces();
  const skip = /loopback|wsl|hyper-v|virtual|vethernet|docker|tailscale|hamachi/i;
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (skip.test(name)) continue;
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  // Fallback: cualquier IPv4 no interna aunque sea virtual.
  for (const addrs of Object.values(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  throw new Error('No se encontro ninguna IP LAN (¿Wi-Fi desconectado?)');
}

const IP_RE = /^\d+\.\d+\.\d+\.\d+$/;
const argIps = process.argv.slice(2).filter((a) => IP_RE.test(a));
const bad = process.argv.slice(2).filter((a) => !IP_RE.test(a));
if (bad.length) throw new Error(`IP invalida: ${bad.join(', ')}`);

const primary = argIps[0] || currentLanIp();

// IPs ya conocidas (conservan la otra red: casa <-> universidad).
const known = new Set(argIps);
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, 'utf8');
  for (const m of raw.matchAll(/https?:\/\/(\d+\.\d+\.\d+\.\d+):\d+/g)) {
    if (IP_RE.test(m[1])) known.add(m[1]);
  }
}
known.add(primary);
// localhost nunca es fallback LAN (Expo Go corre en el teléfono).
for (const lo of ['127.0.0.1', 'localhost']) known.delete(lo);

const ips = [primary, ...[...known].filter((ip) => ip !== primary)];
const directusUrls = ips.map((ip) => `http://${ip}:8055`).join(',');
const socketUrls = ips.map((ip) => `http://${ip}:4001`).join(',');

let lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
const seen = new Set();
lines = lines.map((line) => {
  if (/^EXPO_PUBLIC_DIRECTUS_URL=/.test(line)) {
    seen.add('directus');
    return `EXPO_PUBLIC_DIRECTUS_URL=http://${primary}:8055`;
  }
  if (/^EXPO_PUBLIC_DIRECTUS_URLS=/.test(line)) {
    seen.add('directusList');
    return `EXPO_PUBLIC_DIRECTUS_URLS=${directusUrls}`;
  }
  if (/^EXPO_PUBLIC_SOCKET_URL=/.test(line)) {
    seen.add('socket');
    return `EXPO_PUBLIC_SOCKET_URL=http://${primary}:4001`;
  }
  if (/^EXPO_PUBLIC_SOCKET_URLS=/.test(line)) {
    seen.add('socketList');
    return `EXPO_PUBLIC_SOCKET_URLS=${socketUrls}`;
  }
  return line;
});
if (!seen.has('directus')) lines.push(`EXPO_PUBLIC_DIRECTUS_URL=http://${primary}:8055`);
if (!seen.has('directusList')) lines.push(`EXPO_PUBLIC_DIRECTUS_URLS=${directusUrls}`);
if (!seen.has('socket')) lines.push(`EXPO_PUBLIC_SOCKET_URL=http://${primary}:4001`);
if (!seen.has('socketList')) lines.push(`EXPO_PUBLIC_SOCKET_URLS=${socketUrls}`);
writeFileSync(envPath, lines.filter((l, i, a) => l !== '' || i === a.length - 1).join('\n'));

console.log(`[${hostname()}] .env sincronizado (primaria ${primary}, fallback ${ips.length} red(es)):`);
console.log(`  EXPO_PUBLIC_DIRECTUS_URL=http://${primary}:8055`);
console.log(`  EXPO_PUBLIC_DIRECTUS_URLS=${directusUrls}`);
console.log(`  EXPO_PUBLIC_SOCKET_URL=http://${primary}:4001`);
console.log(`  EXPO_PUBLIC_SOCKET_URLS=${socketUrls}`);
console.log('Reinicia el dev server: npm run dev:app');
