# Repository Guidelines

## Project Structure & Module Organization

This is an npm-workspaces monorepo. `apps/backend` contains the Fastify API, Prisma schema and migrations, and backend tests. Organize API code by business domain under `src/modules`; shared helpers and plugins live under `src/shared` and `src/plugins`. `apps/frontend` contains the Vite/React application: domain features go under `src/features`, reusable UI and helpers under `src/shared`, and translations under `src/i18n/locales`. Docker Compose and Dockerfiles define the local full stack.

## Build, Test, and Development Commands

- `npm install` installs dependencies for both workspaces.
- `docker compose up --build -d` builds and starts PostgreSQL, API, and frontend; copy `.env.example` to `.env` and set strong JWT secrets first.
- `docker compose down` stops containers while preserving database data.
- `npm run build`, `npm run lint`, and `npm run typecheck` run the matching script in each workspace.
- `npm test` runs Vitest in both workspaces. Use `npm -w apps/backend run test` or `npm -w apps/frontend run test` to scope tests.
- For native development, start the database with `docker compose up -d db`, then run `npm -w apps/backend run dev` and `npm -w apps/frontend run dev` in separate terminals. Generate Prisma Client with `npm -w apps/backend run prisma:generate` as needed.

## Coding Style & Naming Conventions

Use TypeScript with the existing ESM setup. Prettier is configured for two-space indentation, single quotes, semicolons, trailing commas, and a 100-character print width. Match surrounding code: React components use PascalCase, hooks use `useX` camelCase, and domain folders and files use descriptive lowercase names. Keep domain logic in its feature/module and shared behavior in shared directories.

## Testing Guidelines

Tests use Vitest; frontend component tests also use Testing Library. Name test files `*.test.ts` or `*.test.tsx` beside the code they cover. Add focused tests for changed business rules, validation, and UI behavior; run the relevant workspace tests and typecheck before submitting.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects such as `Add ...`, `Fix ...`, and `Remove ...`; follow that pattern and describe one change per commit. Pull requests should explain the user-visible change and implementation, list validation commands run, link related issues when applicable, and include screenshots for UI changes.

## Security & Data Invariants

Keep local secrets in ignored `.env`, never commit credentials, and update `.env.example` when configuration changes. Store money as integer COP centavos. Balance mutations must use serializable Prisma transactions, account row locks, and the established delta helpers; update database structure through Prisma migrations.
