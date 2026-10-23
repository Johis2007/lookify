import net from 'node:net';
import { execFileSync } from 'node:child_process';

const ports = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n) && n > 0);
const listenPorts = ports.length > 0 ? ports : [8055];

function resolveWslHost() {
  if (process.env.WSL_HOST) return process.env.WSL_HOST;
  const out = execFileSync('wsl', ['hostname', '-I'], { encoding: 'utf8' });
  const ip = out.trim().split(/\s+/)[0];
  if (!ip) throw new Error('No se pudo obtener la IP de WSL');
  return ip;
}

const targetHost = resolveWslHost();

for (const port of listenPorts) {
  const server = net.createServer((client) => {
    const upstream = net.connect({ host: targetHost, port }, () => {
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  server.on('error', (error) => {
    console.error(`[lan-proxy] ${port}: ${error.message}`);
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`[lan-proxy] 0.0.0.0:${port} -> ${targetHost}:${port}`);
  });
}
