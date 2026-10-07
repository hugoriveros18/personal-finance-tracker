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

Use TypeScript with the existing ESM setup. Prettier is configured for two-space indentation, single quotes, semicolons, trailing commas, and a 100-character print width. Match surrounding code: React components use PascalCase, hooks use `useX` camelCase, and domain folders and files use descriptive lowercase names. Keep domain logic in its feature/module and shared behavior in shared directories. Use English for identifiers, database objects, API contracts, translation keys, comments, test descriptions, and documentation. Spanish remains an optional frontend presentation language; preserve the default and user-entered content.

## Testing Guidelines

Tests use Vitest; frontend component tests also use Testing Library. Backend integration tests live under `apps/backend/tests/integration` and use disposable PostgreSQL 16 through `npm run test:integration`; `npm run test:all` runs every test layer. Never point these tests at development data. Name test files `*.test.ts` or `*.test.tsx` beside the code they cover. Add focused tests for changed business rules, validation, and UI behavior; run the relevant workspace tests and typecheck before submitting.

### Browser E2E workflow (Playwright)

- One-time setup after `npm install`: run `npm -w apps/backend run prisma:generate` and `npx playwright install --with-deps chromium` (browser/system dependencies; Linux package installation may require administrator privileges).
- Run `npm run test:e2e` from the repository root. The runner starts disposable PostgreSQL 16, deploys migrations and starts the real API and Vite on free loopback ports. It overrides database/server settings with test-only values, then stops services and removes the temporary database/uploads. No Docker, `.env` edits or development database reset is needed. Run as a non-root OS user with npm install scripts enabled.
- Use `npm run test:e2e:ui` for interactive debugging, or `npm run test:e2e -- --headed` to watch Chromium. Pass Playwright filters through the runner, for example `npm run test:e2e -- --grep "Spanish expense"`. Do not invoke `npx playwright test` directly: it bypasses isolated environment setup.
- Specs live in `tests/e2e/*.spec.ts`. Start each independent scenario with fresh browser state and create uniquely named users/data if adding scenarios. Tests share a disposable database and run sequentially; do not assume the database is empty after another scenario. The finance scenario verifies Spanish forms, English HTTP payloads, integer cents in PostgreSQL, rendered balances, English translation and preference persistence. The access scenario verifies redirect to login.
- During development, run focused unit/component tests. For changes crossing UI/API boundaries, authentication, balances or translations, run the affected E2E scenarios and update them where behavior changes. Before handing off application changes, run `npm run lint`, `npm run typecheck`, `npm run test:all` and `npm run build`; `test:all` includes unit/component, integration and E2E layers. For documentation-only edits, check affected commands/references without rerunning the application suites.
- Evidence is generated under ignored `test-results/` and `playwright-report/`. Successful finance runs attach `transactions-es.png`, `transactions-en.png`, `accounts-en.png` and a JSON verification summary to the HTML report. Failures preserve screenshots, video and traces; server logs are under `test-results/e2e-server/`. View the report with `npx playwright show-report`. These are evidence captures, not visual snapshot comparisons.
- CI runs only when a PR is opened, not on pushes, subsequent commits or reopened PRs. CI installs Chromium/system dependencies, runs all layers and uploads the report/results as `playwright-results` for 14 days, including on failures. For UI PRs, attach representative current screenshots to the PR description and link the CI artifact/run for reproducible evidence. Do not commit generated images or reports. Creating/publishing a PR still requires the user's authorization.

## Commit & Pull Request Guidelines

Recent commits use short imperative subjects such as `Add ...`, `Fix ...`, and `Remove ...`; follow that pattern and describe one change per commit. Pull requests should explain the user-visible change and implementation, list validation commands run, link related issues when applicable, and include screenshots for UI changes.

## Security & Data Invariants

Keep local secrets in ignored `.env`, never commit credentials, and update `.env.example` when configuration changes. Store money as integer COP cents. Balance mutations must use serializable Prisma transactions, account row locks, and the established delta helpers; update database structure through Prisma migrations.
