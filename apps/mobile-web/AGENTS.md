This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

# NailCRM — AGENTS.md

## Workflow (ahorro de tokens)

1. **Schema:** si toca data layer/api/auth → lee `docs/schema.md`. Si es componente/página/fix menor → saltealo.
2. **Antes de leer archivos, pregúntame.** Propón alcance (archivo específico vs carpeta completa).
3. **No tomes acciones destructivas sin preguntar.** Antes de borrar volúmenes Docker, limpiar datos, reiniciar servicios, o cualquier comando con `--volumes`, `--force`, `rm -rf`, pregunta siempre.
4. **Nunca leas** `old/`, `backend/`, `.env.local`, `node_modules/`,`.env.`.
4. **Prefiere editar sobre leer.** Si sabes qué archivo tocar, edita directo.
5. **Verifica siempre:** `pnpm typecheck && pnpm lint && pnpm build`.

## Quick start

```bash
pnpm install
pnpm dev        # next dev -p 5644
pnpm build
pnpm lint
pnpm typecheck
pnpm format     # prettier --write .
```

## Reglas

- **Data layer:** `NEXT_PUBLIC_DATA_SOURCE=demo|directus`. Carga vía `src/lib/api.ts` (snake_case→camelCase).
- **Multitenant:** toda colección de negocio tiene `tenant_id` → `tenants`.
- **Auth:** cookies `nx_auth_token`, `nx_refresh_token`, `nx_tenant_id`, `nx_user`. Middleware protege `/dashboard`, `/appointments`.
- **Tipos:** `src/lib/types.ts`. **Estilo:** semicolons, double quotes, `@/*` → `src/*`.
- **No leer** `.env.local` o `backend/.env`. Usa `.env.example`.
- **Scripts (orden):** `setup-directus-collections.mjs` → `setup-tenant-rbac-api.mjs` → `apply-tenant-isolation.mjs` → `create-tenant.mjs`

## Setup completo para nuevo desarrollador

```bash
# 1. Clonar
git clone <repo>
cd Nexia-Shalom

# 2. Copiar envs
cp backend/.env.example backend/.env
cp .env.example .env.local

# 3. Editar backend/.env (cambiar DIRECTUS_SECRET, ADMIN_EMAIL, etc.)

# 4. Levantar Directus + PostgreSQL + Redis
docker compose -f backend/docker-compose.yml up -d

# 5. Aplicar snapshot (schema: colecciones + campos + relaciones)
docker cp backend/snapshot.yaml backend-directus-1:/directus/
docker exec backend-directus-1 node /directus/cli.js schema apply /directus/snapshot.yaml

# 6. Crear roles, policies y permisos vía API
node scripts/setup-tenant-rbac-api.mjs

# 7. Aplicar aislamiento tenant (SQL directo a PostgreSQL)
node scripts/apply-tenant-isolation.mjs

# 8. Crear tenant + usuario Owner
node scripts/create-tenant.mjs

# 9. Restaurar datos reales desde backup
# Opción A: Restaurar el último backup (backend/backup-db/latest.sql)
node backend/restore-data.mjs

# Opción B: Restaurar un backup con fecha específica
node backend/restore-data.mjs data-2026-07-22_11-37-44.sql

# Opción C: Sembrar datos demo limpios (sin datos reales)
node scripts/seed-demo-data.mjs

# 10. Instalar y correr frontend
pnpm install
pnpm dev
```

## Backup de datos (export/import)

Los backups se guardan en `backend/backup-db/` con fecha exacta para trazabilidad.
Los scripts viven en `backend/` (separados del frontend).

```bash
# Exportar datos actuales → genera data-YYYY-MM-DD_HH-MM-SS.sql + latest.sql
node backend/export-data.mjs

# Restaurar el último backup (latest.sql)
node backend/restore-data.mjs

# Restaurar un backup específico por nombre
node backend/restore-data.mjs data-2026-07-22_11-37-44.sql

# Listar backups disponibles
node backend/restore-data.mjs --list
```

**Convención de archivos:**
- `data-YYYY-MM-DD_HH-MM-SS.sql` — backup con fecha exacta (trazabilidad)
- `latest.sql` — copia del backup más reciente (para restore rápido)
