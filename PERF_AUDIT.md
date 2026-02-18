# PERF AUDIT - Baseline (No Code Refactor)

Generated at: `2026-02-17 21:07:04 -03:00`  
Repository: `D:/Projetos/np-aparatus`  
Scope of this phase: read-only investigation + baseline commands + recommendations.

## Prompt 51 - Applied optimizations (2026-02-18)

### 1) Runtime and Prisma stability
- Locked Node runtime for DB-backed routes:
  - `app/api/auth/[...all]/route.ts`
  - `app/api/bookings/route.ts`
  - `app/api/chat/route.ts`
  - `app/api/stripe/webhook/route.ts`
- Hardened Prisma singleton in `lib/prisma.ts`:
  - single factory creation path;
  - `globalThis` cache for dev HMR;
  - explicit `DATABASE_URL` guard.

Expected impact:
- Lower risk of accidental Edge runtime regressions for Prisma usage.
- More predictable PrismaClient lifecycle in dev/serverless environments.

### 2) Query optimizations applied
- Home bookings overfetch removed:
  - Added `getUserConfirmedBookings()` in `data/bookings.ts`;
  - `app/page.tsx` now fetches only confirmed bookings.
- Home list bounding:
  - `data/barbershops.ts` now applies bounded `take` limits + deterministic ordering in home/popular list reads.
- Chat search payload reduction:
  - `app/api/chat/route.ts` switched from deep `include` to strict `select`;
  - Added ordered and limited search (`take: 20`).
- Owner dashboard payload slimming:
  - `data/barbershops.ts` owner query now selects only required fields (bookings, user/barber/service names, settings needed by UI).
- Monthly report row-load removal:
  - `data/reports.ts` replaced yearly row fetch with monthly aggregate queries.

Expected impact:
- Reduced DB payload size and serialization cost on high-traffic paths (`/`, `/api/chat`, owner dashboard).
- Lower memory pressure in monthly report generation.

### 3) Indexes added (with evidence in code filters)
- `prisma/schema.prisma` (`Booking`):
  - `@@index([barbershopId, date, cancelledAt])`
  - `@@index([barbershopId, paymentStatus, createdAt])`
  - `@@index([userId, date])`
- Migration file:
  - `prisma/migrations/20260218120000_add_booking_query_indexes/migration.sql`

Expected impact:
- Better selectivity for availability/collision checks, user booking reads, and pending payment scans.

## Prompt 53 - Cache/Revalidate hardening (2026-02-18)

### 1) Shared cache added only for public, idempotent reads
- `data/barbershops.ts` now uses `unstable_cache` for:
  - `getBarbershops(limit)` (home/public list)
  - `getPopularBarbershops(limit)` (home/public list)
  - `getBarbershopById(id)` (public catalog/redirect flows)
  - `getBarbershopBySlug(slug)` (public catalog by slug)
  - `getBarbershopByPublicSlug(publicSlug)` (share route lookup)
- Cache TTL: `300s` via `CACHE_REVALIDATE_SECONDS` in `lib/cache-tags.ts`.
- No shared cache was added to private/session/role-aware reads (`data/bookings.ts`, `data/admin/*`, owner-specific and user-specific reads).

### 2) Tag model
- Added tag helpers in `lib/cache-tags.ts`:
  - `barbershops:list`
  - `barbershops:popular`
  - `barbershop:id:<id>`
  - `barbershop:slug:<slug>`
  - `barbershop:public-slug:<publicSlug>`
- Added centralized invalidation in `lib/cache-invalidation.ts`:
  - `revalidatePublicBarbershopCache(...)`
  - `revalidateBookingSurfaces(...)`

### 3) Mutation invalidation coverage
- Public barbershop data invalidation wired to:
  - `actions/create-service.ts`
  - `actions/update-service.ts`
  - `actions/delete-service.ts`
  - `actions/create-barber.ts`
  - `actions/update-barber.ts`
  - `actions/delete-barber.ts`
  - `actions/update-barbershop-branding.ts`
  - `actions/update-barbershop-schedule.ts`
  - `actions/update-barbershop-services-duration.ts`
  - `actions/update-barbershop-stripe-enabled.ts`
  - `actions/owner-set-featured-services.ts`
  - `actions/owner-update-home-premium.ts`
  - `actions/admin-update-barbershop.ts`
  - `actions/admin-enable-barbershop-access.ts`
  - `actions/admin-disable-barbershop-access.ts`
- Booking surface invalidation wired to:
  - `actions/create-booking.ts`
  - `actions/create-booking-checkout-session.ts` (in-person branch)
  - `actions/cancel-booking.ts`
  - `app/api/stripe/webhook/route.ts` (paid/failed reconciliation)

### 4) Anti-bug outcomes
- Service CRUD now invalidates both owner pages and public cached catalog/list data.
- Schedule/duration updates no longer refresh only `/owner`; they now invalidate related public reads too.
- Booking create/cancel/payment reconciliation now invalidates `/bookings`, `/owner`, `/admin/bookings`, and `/` so lists refresh without hard refresh.

## Prompt 54 - Cleanup and standardization (2026-02-18)

### 1) Cleanup pass (conservative)
- Removed excess debug logs from chat tool execution path:
  - `app/api/chat/route.ts` (`console.log` calls removed, error logs preserved).
- Removed confirmed unused auth callback variables/helpers:
  - `app/api/auth/phone/route.ts` (`authCallbackUrl` chain and unused helper removed).
- Dead-file policy remained conservative:
  - no repo files were deleted in this prompt.

### 2) Prisma consistency (`select` standardization)
- Replaced remaining query-level `include` usage with explicit `select` where safe:
  - `data/bookings.ts` now uses `BOOKING_SCALAR_SELECT`, `USER_BOOKING_SELECT`, `OWNER_BOOKING_SELECT`.
  - `data/admin/bookings.ts` now uses `ADMIN_BOOKING_LIST_SELECT`.
  - `data/barbershops.ts` now uses `BARBERSHOP_DETAILS_SELECT` for detail reads and share token resolution paths.
- `AdminBarbershopWithRelations` typing was normalized to `select`-based payload typing.

### 3) Action error handling consistency
- Added shared helper:
  - `lib/action-errors.ts` (`getActionErrorMessage`).
- Updated catch blocks to use one normalization path:
  - `actions/admin-disable-barbershop-access.ts`
  - `actions/admin-enable-barbershop-access.ts`
  - `actions/admin-promote-to-owner-and-assign-barbershop.ts`
  - `actions/admin-update-barbershop.ts`
  - `actions/admin-update-user-role.ts`

### 4) Guardrails and missing internal modules
- Added dedicated typecheck script/config:
  - `package.json` -> `"typecheck": "tsc --noEmit --pretty false -p tsconfig.typecheck.json"`
  - new `tsconfig.typecheck.json` excluding `.next/**` for direct source checks.
- Restored missing internal modules that were breaking compile/build imports:
  - `lib/notifications/notification-jobs.ts`
  - `lib/share-link-token.ts`
- Adjusted barbershop card typing to match actual list payload:
  - `components/barbershop-item.tsx` now accepts a minimal shape used by listing pages.

### 5) Validation
- `pnpm typecheck`: **success**
- `pnpm lint`: **success**
- `pnpm build`: **success**
- Observed non-blocking warning during build: `baseline-browser-mapping` data is older than 2 months.

## Prompt 52 - Frontend safe optimizations (2026-02-18)

### Antes
- Tabelas/listas grandes no owner/admin renderizavam linhas completas com handlers inline em cada render.
- O grafico anual de `components/owner/reports-card.tsx` carregava o bundle de `recharts` no chunk principal da tela.
- Varios `Image` com `fill` nao tinham `sizes`, aumentando chance de download acima do necessario.
- Havia uso de chaves baseadas em indice em partes de mensagens no chat e chips.

### Depois
- Reducao de rerender em listas com extracao de linhas e callbacks estaveis:
  - `components/owner/services-management-card.tsx`
  - `components/owner/barbers-management-card.tsx`
  - `components/admin/owners-management-table.tsx`
  - `components/bookings/owner-bookings-list.tsx` (extracao de card por item)
- Split de bundle para grafico anual:
  - novo `components/owner/reports-annual-chart.tsx`
  - `components/owner/reports-card.tsx` agora usa `next/dynamic` com fallback de carregamento
- `Image fill` com `sizes` adicionados em:
  - `components/barbershop-item.tsx`
  - `components/service-item.tsx`
  - `components/barbershop-details.tsx`
  - `app/owner/page.tsx`
  - `components/booking-info-sheet.tsx`
  - `components/exclusive-barbershop-landing.tsx`
  - `components/owner/services-management-card.tsx`
  - `components/owner/barbers-management-card.tsx`
  - `components/owner/branding-settings-form.tsx`
- Chaves estabilizadas:
  - `app/chat/page.tsx` usa chave por `message.id + index`
  - `components/owner/exclusive-home-customization-card.tsx` usa `chip` como chave

### Validacao
- Executado: `pnpm exec tsc --noEmit --pretty false` (sucesso).
- Nao executado por politica definida neste prompt: `pnpm lint` e `pnpm build`.
- Escopo mantido sem mudanca de comportamento/UX.

## 1) Baseline

### 1.1 Environment snapshot

- Node.js: `v24.11.0` (README targets Node 22 LTS)
- pnpm: `10.20.0`
- Repo shape discovered:
  - `17` app pages
  - `19` app route handlers
  - `7` app layouts
  - `25` server action files (`actions/`)
  - `11` data layer files (`data/`)
  - `159` Prisma call sites (grep count)
  - `65` `revalidatePath(...)` calls in actions

### 1.2 Command baseline

| Command | Executed | Result | Duration | Notes |
|---|---|---|---|---|
| `pnpm -v` | Yes | Exit `0` | `0.23s` | Returned `10.20.0` |
| `pnpm install --frozen-lockfile` | Yes | Exit `0` | `2.64s` | Lockfile up to date; `prisma generate` ran successfully |
| `pnpm typecheck` | No | N/A | N/A | Script not present in `package.json` |
| `pnpm test` | No | N/A | N/A | Script not present in `package.json` |
| `pnpm lint` | No | N/A | N/A | Intentionally skipped due repo policy in `AGENTS.md` |
| `pnpm build` | No | N/A | N/A | Intentionally skipped due repo policy in `AGENTS.md` |

Install warning observed:
- pnpm reported ignored build scripts for some deps (`@prisma/engines`, `esbuild`, `prisma`, `sharp`, `unrs-resolver`).

### 1.3 Bundle analysis baseline

- `ANALYZE=true pnpm build` was **not executed** because `pnpm build` is blocked by repository policy.
- No bundle analyzer integration found in config/search (`@next/bundle-analyzer`, `ANALYZE` hooks not found).

---

## 2) Findings

## (A) Possible Front bottlenecks

1. Duplicate auth/session resolution in a single request path (P0)
- `app/page.tsx:32` calls `requireAuthenticatedUser()`, then renders `Header` (`app/page.tsx:74`).
- `components/header.tsx:17` calls `getUserRoleFromSession()`, which re-enters `getSessionUser()`.
- `lib/rbac.ts:33`, `lib/rbac.ts:45`, `lib/rbac.ts:58` show repeated session + DB checks.
- Similar duplication in owner/admin surfaces:
  - `app/owner/layout.tsx:12` and `app/owner/page.tsx:46`
  - `app/admin/layout.tsx:19` plus admin data functions requiring admin again (`data/admin/users.ts:50`, `data/admin/barbershops.ts:54`, `data/admin/bookings.ts:50`).

2. Home over-fetches data and renders two full barbershop scrollers (P0)
- `app/page.tsx:65` fetches all barbershops + "popular" barbershops + user bookings in parallel.
- `data/barbershops.ts:148` and `data/barbershops.ts:156` both query full lists with similar payload (no `take` limit).
- `getPopularBarbershops` currently sorts by name desc (`data/barbershops.ts:158`) but still returns entire dataset.

3. Home requests finished bookings even though it only renders confirmed bookings (P0)
- Home only uses `{ confirmedBookings }` (`app/page.tsx:65`), but:
- `data/bookings.ts:83` always executes a second query for finished/cancelled (`data/bookings.ts:94`).

4. Owner/admin large UI surfaces with heavy client hydration (P1)
- Owner management table is large client-only dynamic chunk (`components/admin/owners-management-table-client.tsx:5`, `components/admin/owners-management-table.tsx:250` onward).
- Reports UI triggers multiple no-store fetches and chart rendering in one screen (`components/owner/reports-card.tsx:492`, `components/owner/reports-card.tsx:566`, `components/owner/reports-card.tsx:592`).

5. `next/image` uses `fill` in multiple places without explicit `sizes` hints (P2)
- Examples:
  - `components/barbershop-item.tsx:21`
  - `components/service-item.tsx:19`
  - `components/barbershop-details.tsx:27`
  - `app/owner/page.tsx:119`

## (B) Possible Back bottlenecks

1. Stripe reconciliation in user-facing request paths (P0)
- `data/bookings.ts:70` calls `reconcilePendingBookingsForUser(...)` in normal page reads.
- `data/barbershops.ts:412` calls `reconcilePendingBookingsForBarbershop(...)` in owner dashboard reads.
- Reconciliation loops are sequential and call Stripe per booking:
  - `lib/stripe-booking-reconciliation.ts:93` (Stripe retrieve)
  - `lib/stripe-booking-reconciliation.ts:262` and `lib/stripe-booking-reconciliation.ts:330` (sequential loops).

2. Unpaginated booking payloads with deep relations (P0)
- Owner dashboard loads barbershop with full booking relations (`data/barbershops.ts:455`-`data/barbershops.ts:479`), then page filters/sorts in memory (`app/owner/page.tsx:83`-`app/owner/page.tsx:98`).
- Owner bookings page fetches all bookings without pagination (`data/bookings.ts:132`-`data/bookings.ts:140`).
- User bookings queries are also unbounded (`data/bookings.ts:84`, `data/bookings.ts:94`).

3. Missing composite indexes for hottest booking filters (P0)
- Current Booking indexes are only `barberId` and `startAt` (`prisma/schema.prisma:126`, `prisma/schema.prisma:127`).
- Frequent filters include `barbershopId + date range + cancelledAt + payment status`:
  - `actions/get-date-available-time-slots.ts:100`
  - `actions/create-booking.ts:127`
  - `actions/create-booking-checkout-session.ts:209`
  - `data/admin/bookings.ts:56` + `data/admin/bookings.ts:103`
- At scale this will pressure scans and sort cost.

4. Chat backend can return full barbershop+services sets without limits (P1)
- `app/api/chat/route.ts:230` returns full `findMany` including services when no name is provided.
- Named search also has no limit (`app/api/chat/route.ts:245`).
- Increases DB payload and model token/context cost.

5. Monthly summary aggregates in app memory from row-level data (P1)
- `data/reports.ts:59` fetches booking rows for the full year and loops in JS (`data/reports.ts:77`).
- Good candidate for grouped DB aggregation.

6. Notification dispatch is serial inside batch (P1)
- Job scan batches (`app/api/internal/notifications/dispatch/route.ts:274`) but per-job processing is sequential (`app/api/internal/notifications/dispatch/route.ts:294`), each with multiple DB updates and provider calls.

## (C) Critical routes (highest load/cost risk)

1. `/` (`app/page.tsx`)
- Triple parallel data load + duplicate auth lookup + reconciliation side effects.
- Evidence: `app/page.tsx:32`, `app/page.tsx:65`, `components/header.tsx:17`, `data/bookings.ts:70`.

2. `/owner` (`app/owner/page.tsx`)
- Loads barbershop graph with bookings relations then in-memory split/sort.
- Evidence: `app/owner/page.tsx:48`, `app/owner/page.tsx:83`, `data/barbershops.ts:424`, `data/barbershops.ts:455`.

3. `/bookings` (owner + customer branch)
- Owner branch can load all barbershop bookings.
- Customer branch triggers reconciliation and dual booking queries.
- Evidence: `app/bookings/page.tsx:30`, `app/bookings/page.tsx:75`, `data/bookings.ts:70`, `data/bookings.ts:132`.

4. `/api/chat`
- Unbounded barbershop search payloads + LLM orchestration.
- Evidence: `app/api/chat/route.ts:230`, `app/api/chat/route.ts:245`.

5. `/api/internal/notifications/dispatch`
- Poll/process loop with serial external calls and multiple DB writes.
- Evidence: `app/api/internal/notifications/dispatch/route.ts:272`, `app/api/internal/notifications/dispatch/route.ts:295`.

6. `/api/reports/summary` + `/api/reports/monthly-summary` + `/owner/reports`
- No-store endpoints and 4 requests per filter interaction in client card.
- Evidence: `app/api/reports/summary/route.ts:215`, `app/api/reports/monthly-summary/route.ts:133`, `components/owner/reports-card.tsx:492`, `components/owner/reports-card.tsx:592`.

## (D) Safe quick wins (no business-rule change)

### P0 quick wins

1. Split booking reads by use case
- Create a lightweight `getUserConfirmedBookings()` for home and stop fetching finished bookings there.
- Target files: `app/page.tsx:65`, `data/bookings.ts:46`.
- Impact: high DB/query reduction on most visited route.
- Risk: low.

2. Limit and slim home listing payloads
- Add `take` + deterministic order to `getBarbershops()` and `getPopularBarbershops()`, and avoid duplicate full lists.
- Target files: `data/barbershops.ts:148`, `data/barbershops.ts:156`.
- Impact: high.
- Risk: low.

3. Stop synchronous Stripe reconciliation in render paths
- Move reconciliation to callback/webhook/background trigger points (or gate to explicit booking screens/events).
- Target files: `data/bookings.ts:70`, `data/barbershops.ts:412`, `lib/stripe-booking-reconciliation.ts:215`.
- Impact: high latency and cost reduction.
- Risk: medium.

4. Add composite indexes for booking read patterns
- Candidate indexes:
  - `(barbershopId, date, cancelledAt)`
  - `(barbershopId, paymentStatus, createdAt)`
  - consider `(barbershopId, startAt)` if `startAt` is canonical.
- Target file: `prisma/schema.prisma` booking model.
- Impact: high at scale.
- Risk: medium (migration required).

### P1 quick wins

5. Paginate owner bookings and avoid full relation loads
- Query future/past with `take/skip` and explicit `select`.
- Target files: `data/barbershops.ts:455`, `data/bookings.ts:132`, `app/owner/page.tsx:83`.
- Impact: medium-high.
- Risk: medium.

6. Put bounds on chat barbershop search
- Add `take` and compact `select` for tool responses.
- Target file: `app/api/chat/route.ts:230`, `app/api/chat/route.ts:245`.
- Impact: medium-high cost reduction.
- Risk: low.

7. Reduce broad cache invalidations
- Replace broad `revalidatePath("/")`/global invalidations with narrower paths where possible.
- Baseline shows `65` calls.
- Target files: actions (example `actions/update-barbershop-branding.ts:125`).
- Impact: medium.
- Risk: low-medium.

8. Reduce admin option overfetch
- Replace `pageSize: 200` preloads with search/autocomplete or smaller page.
- Target files: `app/admin/owners/page.tsx:73`, `app/admin/bookings/page.tsx:133`, `app/owner/reports/page.tsx:37`.
- Impact: medium.
- Risk: low.

### P2 quick wins

9. Add `sizes` for all `Image fill` where missing
- Target files: `components/barbershop-item.tsx:21`, `components/service-item.tsx:19`, `components/barbershop-details.tsx:27`, `app/owner/page.tsx:119`.
- Impact: medium on mobile bandwidth/LCP.
- Risk: low.

10. Normalize time-slot query keys
- Sort `serviceIds` before query key serialization to improve cache hits.
- Target file: `constants/query-keys.ts:11`.
- Impact: low-medium.
- Risk: low.

## (E) High-risk items (list only, avoid now)

1. Rewriting booking collision logic to DB locks/transactions
- Current logic is in-memory overlap (`actions/create-booking.ts:154`, `actions/create-booking-checkout-session.ts:236`).
- Risk: can introduce double-booking regressions under concurrency if done incorrectly.

2. Changing Stripe reconciliation semantics
- Core payment lifecycle touches webhook + reconciliation + notifications.
- Files: `app/api/stripe/webhook/route.ts`, `lib/stripe-booking-reconciliation.ts`, `lib/notifications/notification-jobs.ts`.
- Risk: payment state divergence and notification mistakes.

3. Aggressive caching of authenticated/role-aware pages
- Current auth/role checks are strict and dynamic.
- Files: `lib/rbac.ts`, admin/owner layouts.
- Risk: stale authorization exposure if cache boundaries are wrong.

4. Large schema/index migrations without staged rollout
- Booking table is central for checkout, reports, availability, notifications.
- Risk: lock/plan regressions in production if migration is not staged and benchmarked.

---

## 3) Prioritized backlog (P0/P1/P2)

## P0 (High impact, do first)

1. Remove home overfetch (`getUserBookings` split + barbershop list limit/unify)
- Impact: High
- Risk: Low

2. Decouple Stripe reconciliation from page render paths
- Impact: High
- Risk: Medium

3. Add booking composite indexes for hot filters
- Impact: High
- Risk: Medium

4. Reduce duplicate auth/session DB work in same request
- Impact: High
- Risk: Medium

## P1 (Important next)

1. Paginate owner booking lists and narrow relation selects
- Impact: Medium-High
- Risk: Medium

2. Bound and slim chat search payloads
- Impact: Medium-High
- Risk: Low

3. Shrink cache invalidation fan-out (`revalidatePath`)
- Impact: Medium
- Risk: Low-Medium

4. Cut repeated admin barbershop option preloads (`pageSize: 200`)
- Impact: Medium
- Risk: Low

## P2 (Polish / incremental)

1. Add missing `sizes` in `Image fill` usage
- Impact: Medium
- Risk: Low

2. Stabilize query keys for slot fetching
- Impact: Low-Medium
- Risk: Low

3. Tune react-query defaults where safe
- Impact: Low-Medium
- Risk: Low

---

## 4) What was intentionally not changed

- No refactor, no behavior changes, no API contract changes.
- No `pnpm lint` / `pnpm build` execution (repo policy).
- No bundle analyzer execution (build blocked + analyzer support not configured).
