# Frontend Architecture Proposal — Personal Finance Tracker

> **Author:** frontend-architect
> **Date:** 2026-04-26
> **Stack constraints (fixed):** React + TypeScript, Docker-deployed, single-user-per-instance, local-only.

---

## 1. Vite vs Next.js — **Vite + React (SPA)**

Next.js's value prop (SSR/SSG/ISR, file-system routing, RSC, image optimization, middleware) is irrelevant for a local-only authenticated app. Vite gives faster HMR, simpler Docker output (`dist/` static + nginx), and clean Vitest integration.

Build settings: ES2022 target, route-level code splitting via `React.lazy`, `manualChunks` for `react-vendor`, `charts`, `ui`.

---

## 2. UI library — **Mantine v7**

Mantine ships everything we need on day one without compositional ceremony: polished `DataTable` (via `mantine-datatable`), `Modal` + `modals.openConfirmModal` manager, `useForm`, light/dark theme tokens with a `MantineProvider` color scheme switch (no flash via `data-mantine-color-scheme`), `NumberInput` with thousand-separator/decimal-separator, `@mantine/dates` (locale-aware), `@mantine/notifications` (toasts).

Rejected: MUI (heavier; free DataGrid lacks combinable filtering); Ant Design (enterprise look, theming friction); Chakra (no DataTable); Shadcn/Radix+Tailwind (toolkit, every component hand-assembled).

Concrete pieces:
- `MantineProvider` with custom theme.
- `mantine-datatable` for transactions/movements.
- `@mantine/modals` for centralized modal manager.
- `@mantine/form` (or RHF, see §6).
- `@mantine/dates` (dayjs under the hood).
- `@mantine/notifications`.

---

## 3. Charting library — **Recharts**

Declarative React API, covers BarChart/LineChart/PieChart, themes via `useMantineTheme()`, ~90 KB gzipped, mature.

Rejected: ECharts (config-object API, 300+ KB), Nivo (heavier deps), Chart.js (imperative, weak TS), Visx (toolkit), `@mantine/charts` (locks styling).

All charts wrapped by `<ChartShell>` (ResponsiveContainer + tooltip + theme colors).

---

## 4. State management

- **Server state:** TanStack Query v5 (non-negotiable). `staleTime: 30s`, `gcTime: 5min`. Query keys colocated with feature.
- **Client UI state:** Zustand. Three slices:
  - `authStore` — user, accessToken, login/logout/setUser.
  - `preferencesStore` — theme, language. Persisted to `localStorage` key `pft.preferences`.
  - `uiStore` — sidebar collapsed, mobile drawer open.

Redux Toolkit overkill; Context worse selector ergonomics and re-render story.

---

## 5. Routing — **React Router v7 (data router)**

Loaders, actions, `defer`, `useNavigation`, `useFetcher` built-in. Massive ecosystem. TanStack Router has nicer type-safe params but smaller ecosystem; not worth the trade for a solo project.

```
/                          (PublicLayout)
  /login
  /register
/app                       (AuthGuardLayout)
  /                        (DashboardPage — index)
  /accounts
  /accounts/:id
  /categories
  /transactions
  /movements
  /profile
  /backup
*                          (NotFoundPage)
```

Loaders prefetch via `queryClient.ensureQueryData`.

---

## 6. Forms & validation — **React Hook Form + Zod**

RHF over Mantine's `useForm`: uncontrolled-by-default, snappier on a multi-field transaction modal. RHF + `@hookform/resolvers/zod` is industry-default. Zod TypeScript-native, schemas double as runtime API parsers.

```ts
export const transactionFormSchema = z.object({
  accountId: z.string().uuid(),
  categoryId: z.string().uuid(),
  tipo: z.enum(['ingreso', 'egreso', 'pasivo']),
  valor: z.number().int().positive(),
  descripcion: z.string().max(200),
  fecha: z.coerce.date(),
});
```

---

## 7. i18n — **react-i18next**

Largest ecosystem, namespacing, plurals via `i18next-icu` if needed.

- Two namespaces per feature under `src/i18n/locales/{es,en}/`.
- Default: `es`. Detection order: `preferencesStore` → server profile → `navigator.language` → `es`.
- Money/dates **not in JSON** — use `Intl.NumberFormat` / `Intl.DateTimeFormat` via a `useFormatters()` hook.

---

## 8. Theme system (light/dark, no flash)

- Source of truth: `preferencesStore` Zustand slice, persisted to `localStorage`.
- Server sync: `/me` returns `preferredTheme` and `preferredLanguage`. On login we hydrate; on profile-page change we PATCH `/me` and update the store.
- Mantine: `<MantineProvider defaultColorScheme={resolvedTheme}>`.

**No-flash bootstrap script** (inline in `index.html` `<head>`):
```html
<script>
  (function () {
    try {
      const raw = localStorage.getItem('pft.preferences');
      const theme = raw ? JSON.parse(raw).state?.theme : null;
      const resolved = theme === 'dark' || theme === 'light'
        ? theme
        : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.setAttribute('data-mantine-color-scheme', resolved);
    } catch (_) {
      document.documentElement.setAttribute('data-mantine-color-scheme', 'light');
    }
  })();
</script>
```

Mantine v7 reads `data-mantine-color-scheme` from `<html>` to apply CSS variables — no flash.

Language: i18n bundles `es` and `en` synchronously; same `localStorage` blob picked at `i18n.ts` init.

---

## 9. Folder structure — **feature-sliced**

```
apps/frontend/
├── public/
├── index.html
├── vite.config.ts
├── tsconfig.json
└── src/
    ├── main.tsx
    ├── app/
    │   ├── App.tsx
    │   ├── routes.tsx
    │   ├── providers/{QueryProvider,ThemeProvider,I18nProvider,ModalProvider}.tsx
    │   └── layouts/{AuthLayout,AppLayout}.tsx
    ├── features/
    │   ├── auth/{api,components,hooks,pages,schemas,types}
    │   ├── accounts/{api,components,hooks,pages,modals,schemas,types}
    │   ├── categories/...
    │   ├── transactions/...
    │   ├── movements/...
    │   ├── liability-payments/...
    │   ├── dashboard/...
    │   ├── profile/...
    │   └── backup/...
    ├── shared/
    │   ├── api/{client,errors,types}.ts
    │   ├── components/{MoneyInput,MoneyDisplay,DateInput,DataTable,EmptyState,
    │   │               ErrorBoundary,SkeletonCard,ConfirmDialog,Page,
    │   │               ChartShell,FilterChips}.tsx
    │   ├── hooks/{useFormatters,useDebounced,useUrlFilters,useMediaQuery}.ts
    │   ├── lib/{money,date,pagination,zod}.ts
    │   ├── stores/{authStore,preferencesStore,uiStore}.ts
    │   └── types/domain.ts
    ├── i18n/
    │   ├── index.ts
    │   └── locales/{es,en}/{common,auth,accounts,categories,transactions,...}.json
    └── styles/{globals.css,theme.ts}
```

Convention: features may import from `shared/` and `app/`, never from each other.

---

## 10. Component hierarchy & dashboard layout

| Route | Page | Key components |
|---|---|---|
| `/login` | LoginPage | LoginForm |
| `/register` | RegisterPage | RegisterForm |
| `/app` | DashboardPage | MonthYearSelector, MonthlySummaryCard, GlobalSnapshotCard, IncomeBarChart, ExpensesBarChart, SavingsBarChart, TopCategoriesMonth, TopCategoriesYear |
| `/app/accounts` | AccountsListPage | AccountsTotalsBar, AccountCard[], +New, **Pagar pasivo** action on cards |
| `/app/accounts/:id` | AccountDetailPage | AccountHeaderCard, tabs (Transacciones, Movimientos, Pagos de pasivo) |
| `/app/categories` | CategoriesPage | CategoryList, CategoryFormModal, CategoryDistributionPieChart, CategoryTrendChart |
| `/app/transactions` | TransactionsPage | TransactionsToolbar, TransactionsTable |
| `/app/movements` | MovementsPage | MovementsToolbar, MovementsTable |
| `/app/profile` | ProfilePage | ProfileForm, ChangePasswordForm, AvatarUploader, ThemeToggle, LanguageToggle |
| `/app/backup` | BackupPage | ExportButton, ImportDropzone, ImportConfirmDialog |

### Dashboard layout (desktop ≥1280)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Topbar:  [logo]  PFT                            [month picker]  [user menu] │
├────────┬─────────────────────────────────────────────────────────────────────┤
│ Side   │   ┌──────────────────────────────┬────────────────────────────────┐ │
│ Nav    │   │  Monthly Summary             │  Global Snapshot (today)       │ │
│        │   │  Income $4.200.000           │  Disponible $5.100.000         │ │
│        │   │  Expense $2.850.000          │  Ahorro     $9.300.000         │ │
│        │   │  Savings $1.350.000          │  Pasivos    $1.150.000         │ │
│        │   └──────────────────────────────┴────────────────────────────────┘ │
│        │   ┌──────────────────────────────┬────────────────────────────────┐ │
│        │   │ Income / month (year bars)   │ Expenses / month (year bars)   │ │
│        │   └──────────────────────────────┴────────────────────────────────┘ │
│        │   ┌──────────────────────────────┬────────────────────────────────┐ │
│        │   │ Savings / month              │ Top 4 cats (selected month)    │ │
│        │   └──────────────────────────────┴────────────────────────────────┘ │
│        │   ┌──────────────────────────────────────────────────────────────┐  │
│        │   │ Top 4 categories (year)                                      │  │
│        │   └──────────────────────────────────────────────────────────────┘  │
└────────┴─────────────────────────────────────────────────────────────────────┘
```

**Tablet (≥768, <1280):** sidebar → icon rail; chart pairs become 1-up.
**Mobile (<768):** sidebar → drawer (hamburger), all 1-col, tables → card list.

---

## 11. Filtering UX — **toolbar + chips, URL-synced**

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [Categoría ▾] [Cuenta ▾] [Tipo ▾] [Valor ▾]   [Buscar...]    [Clear all] │
├────────────────────────────────────────────────────────────────────────────┤
│ Active: [Mercado ✕] [Bancolombia ✕] [Egreso ✕]                            │
└────────────────────────────────────────────────────────────────────────────┘
```

Filters AND together. Each filter is multi-select OR'd internally. URL sync via `useUrlFilters<TFilters>(schema)` hook drives both URL state and React Query keys.

Search params:
```
/app/transactions?categories=cat-1,cat-2&accounts=acc-1&types=egreso,pasivo
                 &valorMin=10000&valorMax=2000000&page=3&pageSize=25
                 &month=2026-04
```

---

## 12. Modal system — **centralized via `@mantine/modals`**

`appModals` helpers wrap `modals.open` / `modals.openConfirmModal`:

```ts
appModals.openTransactionForm(initial?: Transaction)
appModals.openTransactionView(id: string)
appModals.confirmDelete({ onConfirm, title, body })
appModals.openLiabilityPayment(account: Account)
```

Stack semantics, focus-trap restoration, ESC behavior all handled.

---

## 13. Pagination & table — **server-side**

`GET /api/v1/transactions` query params:
| Param | Default |
|---|---|
| `page` | 1 |
| `pageSize` | 25 (10/25/50/100) |
| `sort` | `-fecha` |
| `categoryIds` | csv |
| `accountIds` | csv |
| `tipos` | csv |
| `valorMin`, `valorMax` | int |
| `from`, `to` | ISO date |
| `month` | YYYY-MM |
| `q` | text |

Response includes filter-aware totals so we can show "213 transacciones · ingresos $4.200.000 · egresos $2.850.000" above the table.

`mantine-datatable` configured for server-side pagination, sorting, row click → detail modal, dots menu (View/Edit/Delete) in last column, empty state, fetching overlay.

---

## 14. Money input/formatting

### COP format

`Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })` produces `$ 1.250.000` (NBSP after `$`). Strip via `formatToParts`:

```ts
const fmt = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0
});
export function formatCop(n: number): string {
  return fmt.formatToParts(n)
    .filter(p => !(p.type === 'literal' && p.value.trim() === ''))
    .map(p => p.value).join('');
}
```

Output: `$1.250.000`. Negative: `-$450.000`. Zero: `$0`.

### Parsing

```ts
export function parseCop(input: string): number | null {
  const digits = input.replace(/[^\d-]/g, '');
  if (!digits || digits === '-') return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}
```

### `<MoneyInput>` (RHF-friendly)

Built on Mantine `NumberInput`:
```tsx
<NumberInput
  prefix="$" thousandSeparator="." decimalSeparator=","
  decimalScale={0} allowNegative={false} allowDecimal={false}
  hideControls
  value={value ?? ''}
  onChange={(v) => field.onChange(typeof v === 'number' ? v : parseCop(String(v)))}
/>
```

Form holds the **integer**. Validation: `z.number().int().nonnegative().max(999_999_999_999)`.

---

## 15. Number/date formatting

`@mantine/dates` (`DatePickerInput`, `DatePicker`), built on dayjs, locale-aware.

| Locale | DD/MM/YYYY | Long form |
|---|---|---|
| `es` | `26/04/2026` | `26 de abril de 2026` |
| `en` | `04/26/2026` | `Apr 26, 2026` |

`useFormatters()` hook switches on `preferencesStore.language`.

---

## 16. Responsive strategy

| Breakpoint | Behavior |
|---|---|
| ≥1200 (lg) | Full sidebar, 2-col charts |
| 992–1200 (md) | Icon rail sidebar |
| 768–992 (sm) | Charts 1-col |
| <768 (xs) | Sidebar → drawer, tables → card list, modals fullscreen |

`useMediaQuery` from `@mantine/hooks` + `visibleFrom`/`hiddenFrom` props.

---

## 17. Error/loading states

| Surface | Loading | Error |
|---|---|---|
| Page initial | Skeleton | Boundary + retry |
| Tables | DataTable `fetching` overlay | Inline banner + retry |
| Form submit | Button spinner + disabled | Inline + toast |
| Mutations | Optimistic where safe; toast otherwise | Toast with rollback |

`@mantine/notifications`, top-right, 4s, errors persistent. Global error boundary at `/app`.

Error taxonomy (`shared/api/errors.ts`):
- `ApiValidationError(422)` → RHF field errors.
- `ApiAuthError(401, 403)` → logout + redirect.
- `ApiNotFoundError(404)` → empty state.
- `ApiConflictError(409)` → toast.
- `ApiServerError(5xx)` → toast + retry.

---

## 18. Avatar upload

1. Click avatar → file input (png/jpg/webp).
2. Client validates: ≤5 MB, mime allowed.
3. Crop modal via `react-easy-crop` (square, returns Blob).
4. Multipart POST to `/api/v1/me/avatar`.
5. Backend resizes to 512×512 webp via `sharp`.
6. Response `{ avatarPath }` → update `authStore` + invalidate `['me']`.

Fallback: Mantine `<Avatar>` with initials.

---

## Appendix — Dependencies

```jsonc
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^7.0.0",
    "@mantine/core": "^7.13.0",
    "@mantine/hooks": "^7.13.0",
    "@mantine/form": "^7.13.0",
    "@mantine/dates": "^7.13.0",
    "@mantine/notifications": "^7.13.0",
    "@mantine/modals": "^7.13.0",
    "@tabler/icons-react": "^3.0.0",
    "mantine-datatable": "^7.11.0",
    "dayjs": "^1.11.0",
    "@tanstack/react-query": "^5.50.0",
    "@tanstack/react-query-devtools": "^5.50.0",
    "axios": "^1.7.0",
    "zustand": "^4.5.0",
    "react-hook-form": "^7.52.0",
    "@hookform/resolvers": "^3.9.0",
    "zod": "^3.23.0",
    "i18next": "^23.14.0",
    "react-i18next": "^15.0.0",
    "i18next-browser-languagedetector": "^8.0.0",
    "recharts": "^2.12.0",
    "react-easy-crop": "^5.0.0"
  }
}
```
