# Vercel + Prisma Diagnostic (np-aparatus)

## Update 2026-02-18 - Prompt 51 Applied

### Runtime compatibility status (after changes)
- No `runtime = "edge"` was found in Prisma/Auth DB-backed routes.
- Added explicit `export const runtime = "nodejs"` in:
  - `app/api/auth/[...all]/route.ts`
  - `app/api/bookings/route.ts`
  - `app/api/chat/route.ts`
  - `app/api/stripe/webhook/route.ts`
- Result: all known DB-backed API handlers are now explicitly locked to Node.js runtime.

### Prisma client hardening
- Updated `lib/prisma.ts` to:
  - use `globalThis` singleton cache in development (`prisma?: PrismaClient`);
  - instantiate through a single `createPrismaClient()` factory;
  - fail fast when `DATABASE_URL` is missing.
- Result: safer initialization path for serverless and local HMR, avoiding accidental multi-client creation patterns.

### Query tuning highlights
- `app/api/chat/route.ts`
  - replaced deep `include` payload with strict `select`;
  - added deterministic ordering and limit (`take: 20`) to barbershop search.
- `app/page.tsx` + `data/bookings.ts`
  - created lightweight `getUserConfirmedBookings()` and stopped fetching finished bookings for home.
- `data/barbershops.ts`
  - added bounded list limits for home/popular list queries;
  - narrowed owner dashboard barbershop query to only required booking/barber/user/service fields.
- `data/reports.ts`
  - replaced yearly row fetch with monthly aggregate queries to avoid loading full booking rows in memory.

### Indexes added with code evidence
- `prisma/schema.prisma` (`Booking` model):
  - `@@index([barbershopId, date, cancelledAt])`
  - `@@index([barbershopId, paymentStatus, createdAt])`
  - `@@index([userId, date])`
- Migration created:
  - `prisma/migrations/20260218120000_add_booking_query_indexes/migration.sql`
- Evidence sources:
  - availability + collision filters in `actions/create-booking.ts`, `actions/create-booking-checkout-session.ts`, `actions/get-date-available-time-slots.ts`;
  - pending/failed/payment listing patterns in `lib/stripe-booking-reconciliation.ts`, `data/admin/bookings.ts`, `data/bookings.ts`.

## 1) Runtime atual (Node vs Edge)

### Resultado da busca obrigatoria
- Nao foi encontrado `runtime = "edge"` no repositorio.
- Foram encontrados varios handlers com `export const runtime = "nodejs"`:
  - `app/api/admin/barbershops/[id]/plan/route.ts:28`
  - `app/api/auth/phone/route.ts:121`
  - `app/api/internal/notifications/dispatch/route.ts:353`
  - `app/api/owner/barbershop/whatsapp-settings/route.ts:17`
  - `app/api/reports/monthly-summary/route.ts:22`
  - `app/api/reports/summary/route.ts:41`
  - `app/api/uploads/barbershops/route.ts:23`
  - `app/api/uploads/logos/route.ts:3`
  - `app/api/uploads/services/route.ts:23`
  - `app/api/users/me/complete-profile/route.ts:63`
  - `app/api/users/me/phone/confirm-verification/route.ts:19`
  - `app/api/users/me/phone/start-verification/route.ts:23`

### Rotas sem `runtime` explicito
- `app/api/auth/[...all]/route.ts`
- `app/api/bookings/route.ts`
- `app/api/chat/route.ts`
- `app/api/stripe/webhook/route.ts`

Inferencia: essas rotas sem export explicito ficam no runtime padrao do Next.js para Route Handlers (Node.js), mas nao estao "travadas" explicitamente como Node no codigo.

## 2) Onde Prisma e usado

### Instanciacao do PrismaClient
- Arquivo: `lib/prisma.ts`
  - `PrismaClient` vem de `@/generated/prisma/client` (`lib/prisma.ts:3`).
  - Usa `PrismaPg` adapter com `DATABASE_URL` (`lib/prisma.ts:4`, `lib/prisma.ts:6`, `lib/prisma.ts:8`).
  - Instancia client em singleton global (`lib/prisma.ts:10-14`):
    - `export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });`
    - Apenas em desenvolvimento salva em `globalThis` (`NODE_ENV !== "production"`).

### Auth tambem depende de Prisma
- Arquivo: `lib/auth.ts`
  - `better-auth` configurado com `prismaAdapter(prisma, { provider: "postgresql" })` (`lib/auth.ts:47-50`).
  - Isso implica acesso ao banco em fluxo de sessao/auth.

### Camadas com uso de Prisma
- `data/*`:
  - `data/barbershops.ts`
  - `data/barbers.ts`
  - `data/bookings.ts`
  - `data/customer-barbershops.ts`
  - `data/owner-assignment.ts`
  - `data/reports.ts`
  - `data/reports-shared.ts`
  - `data/services.ts`
  - `data/admin/barbershops.ts`
  - `data/admin/bookings.ts`
  - `data/admin/users.ts`
- `actions/*` (direto via `@/lib/prisma` ou indireto via `data/*`):
  - `actions/admin-disable-barbershop-access.ts`
  - `actions/admin-enable-barbershop-access.ts`
  - `actions/admin-promote-to-owner-and-assign-barbershop.ts`
  - `actions/admin-update-barbershop.ts`
  - `actions/admin-update-user-role.ts`
  - `actions/cancel-booking.ts`
  - `actions/create-barber.ts`
  - `actions/create-booking.ts`
  - `actions/create-booking-checkout-session.ts`
  - `actions/create-service.ts`
  - `actions/delete-barber.ts`
  - `actions/delete-service.ts`
  - `actions/demote-owner-to-customer.ts`
  - `actions/get-date-available-time-slots.ts`
  - `actions/get-owner-report.ts`
  - `actions/link-customer-to-barbershop-from-cookie.ts`
  - `actions/owner-set-featured-services.ts`
  - `actions/owner-update-home-premium.ts`
  - `actions/promote-user-to-owner.ts`
  - `actions/update-barber.ts`
  - `actions/update-barbershop-branding.ts`
  - `actions/update-barbershop-schedule.ts`
  - `actions/update-barbershop-services-duration.ts`
  - `actions/update-barbershop-stripe-enabled.ts`
  - `actions/update-service.ts`
- Rotas API e outros pontos:
  - `app/api/admin/barbershops/[id]/plan/route.ts`
  - `app/api/auth/[...all]/route.ts` (indireto, via `lib/auth.ts`)
  - `app/api/auth/phone/route.ts`
  - `app/api/bookings/route.ts` (indireto, via action)
  - `app/api/chat/route.ts`
  - `app/api/internal/notifications/dispatch/route.ts`
  - `app/api/owner/barbershop/whatsapp-settings/route.ts`
  - `app/api/reports/monthly-summary/route.ts`
  - `app/api/reports/summary/route.ts`
  - `app/api/stripe/webhook/route.ts`
  - `app/api/uploads/barbershops/route.ts`
  - `app/api/uploads/services/route.ts`
  - `app/api/users/me/complete-profile/route.ts`
  - `app/api/users/me/phone/confirm-verification/route.ts`
  - `app/api/users/me/phone/start-verification/route.ts`
  - `app/complete-profile/page.tsx`
  - `lib/notifications/notification-jobs.ts`
  - `lib/stripe-booking-reconciliation.ts`
  - `prisma/seed.ts`
  - `prisma/backfill-public-slugs.ts`

## 3) Variaveis de ambiente relacionadas a DB

### Encontradas no codigo
- `DATABASE_URL`:
  - `lib/prisma.ts:6`
  - `prisma.config.ts:13`
  - `prisma/seed.ts:6`
  - `prisma/backfill-public-slugs.ts:7`

### Encontradas em template de ambiente
- `.env.example:1` -> `DATABASE_URL=""`

### Nao encontradas na base
- `DIRECT_URL`
- `POSTGRES_URL`
- `POSTGRES_PRISMA_URL`

## 4) Lista de rotas/server actions que acessam DB

### Rotas (API)
- `app/api/admin/barbershops/[id]/plan/route.ts` (direto)
- `app/api/auth/[...all]/route.ts` (indireto via Better Auth + Prisma adapter)
- `app/api/auth/phone/route.ts` (direto)
- `app/api/bookings/route.ts` (indireto via `actions/create-booking`)
- `app/api/chat/route.ts` (direto e indireto)
- `app/api/internal/notifications/dispatch/route.ts` (direto)
- `app/api/owner/barbershop/whatsapp-settings/route.ts` (direto)
- `app/api/reports/monthly-summary/route.ts` (direto e indireto)
- `app/api/reports/summary/route.ts` (direto e indireto)
- `app/api/stripe/webhook/route.ts` (direto)
- `app/api/uploads/barbershops/route.ts` (direto)
- `app/api/uploads/services/route.ts` (direto)
- `app/api/users/me/complete-profile/route.ts` (direto)
- `app/api/users/me/phone/confirm-verification/route.ts` (direto)
- `app/api/users/me/phone/start-verification/route.ts` (direto)

### Server Actions
- `actions/admin-disable-barbershop-access.ts`
- `actions/admin-enable-barbershop-access.ts`
- `actions/admin-promote-to-owner-and-assign-barbershop.ts`
- `actions/admin-update-barbershop.ts`
- `actions/admin-update-user-role.ts`
- `actions/cancel-booking.ts`
- `actions/create-barber.ts`
- `actions/create-booking.ts`
- `actions/create-booking-checkout-session.ts`
- `actions/create-service.ts`
- `actions/delete-barber.ts`
- `actions/delete-service.ts`
- `actions/demote-owner-to-customer.ts`
- `actions/get-date-available-time-slots.ts`
- `actions/get-owner-report.ts`
- `actions/link-customer-to-barbershop-from-cookie.ts`
- `actions/owner-set-featured-services.ts`
- `actions/owner-update-home-premium.ts`
- `actions/promote-user-to-owner.ts`
- `actions/update-barber.ts`
- `actions/update-barbershop-branding.ts`
- `actions/update-barbershop-schedule.ts`
- `actions/update-barbershop-services-duration.ts`
- `actions/update-barbershop-stripe-enabled.ts`
- `actions/update-service.ts`

## 5) Riscos detectados (Vercel + Prisma) e recomendacoes

### Risco A: incompatibilidade Edge x Prisma
- Estado atual: nao ha `runtime = "edge"` no repo.
- Risco: se alguma rota DB-backed migrar para Edge no futuro, o acesso Prisma/adapter pode quebrar.
- Recomendacao:
  - manter handlers que usam DB explicitamente em Node (`export const runtime = "nodejs"`),
  - adicionar check em review/CI para bloquear `runtime = "edge"` em arquivos que importam Prisma.

### Risco B: excesso de conexoes em ambiente serverless
- Observacao:
  - a app usa somente `DATABASE_URL`;
  - nao ha `DIRECT_URL` nem indicio de split pool/non-pool;
  - em producao nao ha cache global cross-instance (normal em serverless), entao cada instancia pode abrir seu proprio pool.
- Impacto possivel: estourar limite de conexoes do Postgres sob pico de concorrencia.
- Recomendacao:
  - usar endpoint pooled para `DATABASE_URL` em producao (provider com pooler/pgBouncer/managed pool),
  - separar URL de migracao/admin (`DIRECT_URL`) quando aplicavel,
  - monitorar ativamente total de conexoes vs concorrencia de funcoes.

### Risco C: cold start e latencia inicial
- Observacao:
  - Prisma e adapter sao inicializados por instancia de funcao;
  - endpoints de alto volume (auth, bookings, chat, webhook, relatorios) podem sofrer mais em cold starts.
- Recomendacao:
  - priorizar regiao proxima ao banco,
  - medir p95/p99 de latencia por rota,
  - reduzir fan-out de consultas em endpoints criticos quando possivel.

### Risco D: jobs/rotas com carga transacional
- Observacao:
  - ha uso de transacoes e processamento em lote, por exemplo:
    - `app/api/internal/notifications/dispatch/route.ts`
    - `app/api/admin/barbershops/[id]/plan/route.ts`
    - varias server actions de update em lote.
- Impacto possivel: maior tempo de execucao por invocacao e pressao de conexao.
- Recomendacao:
  - manter batches pequenos,
  - usar timeouts e observabilidade por rota,
  - acompanhar lock/contention em horarios de pico.

## Conclusao rapida
- Hoje: runtime efetivo orientado a Node, sem Edge explicito.
- Prisma: centralizado em `lib/prisma.ts`, amplamente usado em data/actions/routes/auth.
- Principal risco operacional em Vercel: conexoes (pool/concurrency), seguido de cold start em rotas de maior trafego.
