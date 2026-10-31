#!/usr/bin/env node
// Verifica que el flujo cliente/profesional mantenga la paridad declarada en
// scripts/parity.config.json. Falla con exit 1 y lista archivo + snippet que
// falta. No ejecuta la app: es una prueba de cableado/regresion estatica.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const configPath = resolve(here, 'parity.config.json');

function fail(message) {
  console.error(`PARITY FAIL: ${message}`);
  process.exit(1);
}

if (!existsSync(configPath)) fail(`no existe ${configPath}`);

let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
  fail(`parity.config.json invalido: ${error instanceof Error ? error.message : String(error)}`);
}

if (config.version !== 1) fail(`version no soportada: ${config.version}`);
for (const group of ['entrypoints', 'screens', 'services']) {
  if (!Array.isArray(config[group]) || config[group].length === 0) {
    fail(`grupo "${group}" ausente o vacio`);
  }
}

const seen = new Set();
const errors = [];
let checked = 0;
const modeCount = { real: 0, mock: 0 };

function checkEntry(group, entry) {
  const label = `${group}:${entry.id}`;
  if (!entry.id || !entry.file || !entry.logic || !Array.isArray(entry.mustContain)) {
    errors.push(`${label} incompleto (id/file/logic/mustContain)`);
    return;
  }
  if (seen.has(entry.id)) errors.push(`${label} id duplicado`);
  seen.add(entry.id);

  if (entry.mode && entry.mode !== 'real' && entry.mode !== 'mock') {
    errors.push(`${label} mode invalido: ${entry.mode}`);
    return;
  }
  if (entry.mode) modeCount[entry.mode] += 1;

  const absolute = resolve(root, entry.file);
  if (!existsSync(absolute)) {
    errors.push(`${label} no existe ${entry.file}`);
    return;
  }

  const content = readFileSync(absolute, 'utf8');
  checked += 1;
  for (const snippet of entry.mustContain) {
    if (typeof snippet !== 'string' || snippet.length === 0) {
      errors.push(`${label} snippet invalido`);
      continue;
    }
    if (!content.includes(snippet)) {
      errors.push(`${label} ${entry.file} no contiene: ${JSON.stringify(snippet)}`);
    }
  }
}

for (const group of ['entrypoints', 'screens', 'services']) {
  for (const entry of config[group]) checkEntry(group, entry);
}

if (errors.length > 0) {
  console.error(`PARITY FAIL (${errors.length} problema(s)):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `PARITY OK: ${checked} archivo(s)/contrato(s) verificados ` +
  `(${config.entrypoints.length} entrypoints, ${config.screens.length} pantallas, ` +
  `${config.services.length} servicios; real=${modeCount.real}, mock=${modeCount.mock}).`,
);
