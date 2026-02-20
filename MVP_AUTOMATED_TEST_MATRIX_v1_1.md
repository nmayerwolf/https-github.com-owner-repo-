# MVP Automated Test Matrix v1.1 (Mapped to Repo)

Este documento traduce los tests mínimos del spec a suites concretas del repo.

## 1) Provider Test

### Requisito
- Can fetch daily bars for SPY.

### Implementación
- Archivo: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/marketDataProvider.service.test.js`
- Caso:
  - `fetches daily bars for SPY`

## 2) Regime Test

### Requisito
- Returns valid enum + confidence between 0 and 1.

### Implementación
- Archivo: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/regime.service.test.js`
- Casos mínimos:
  - Regime en enum cerrado `risk_on|risk_off|transition`.
  - Confidence `>=0 && <=1`.
  - Volatility regime en enum `normal|elevated|crisis`.
  - Crisis trigger por `spy_ret_1d <= -0.03`.

Estado actual:
- Cubierto.

## 3) Recommendation Test

### Requisito
- Produces at least 1 strategic idea if data exists.

### Implementación
- Archivo: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/portfolioAdvisor.service.test.js`
- Caso:
  - `generateForUser yields at least one recommendation when data exists`.

Estado actual:
- Cubierto con aserción de presencia `strategyType=strategic`.

## 4) Profile Test

### Requisito
- Changing focus slider changes ratio strategic/opportunistic.

### Implementación objetivo
- Archivo: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/profileFocus.service.test.js`
- Casos mínimos:
  - `focus=0.2` => strategic share menor que con `focus=0.8`.
  - ratio strategic/opportunistic cambia monotónicamente al mover focus.

Estado actual:
- Cubierto.

## 5) Portfolio Limits Test

### Requisito
- Cannot create 4th portfolio.
- Cannot add 16th holding.

### Implementación
- Archivo: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/portfolio.routes.test.js`
- Casos:
  - `rejects creating 4th portfolio`
  - `rejects create when portfolio reached 15 active holdings`

Estado actual:
- Alineado a `422` para límites de negocio.
- Alineado a `400` para `BAD_REQUEST` de payload inválido (`VALIDATION_ERROR` y derivados).

## 6) Access Control Test

### Requisito
- Viewer cannot update holdings.
- Editor can.

### Implementación
- Archivo: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/portfolio.routes.test.js`
- Casos:
  - `forbids viewer collaborator from updating holding`
  - `allows editor collaborator to update holding`

## 7) Test Command Set (CI local)

### API full
```bash
cd /Users/nmayerwolf/Documents/nexusfin/nexusfin-api
npm test
```

### Web unit
```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm test
```

### E2E (mercado oculto / deep-link guard)
```bash
cd /Users/nmayerwolf/Documents/nexusfin
npm run test:e2e -- tests/e2e/auth-portfolio-flow.spec.js
```

## 8) Gap Checklist (para cerrar 100%)
- [x] Crear `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/regime.service.test.js`.
- [x] Crear `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/tests/profileFocus.service.test.js`.
- [x] Alinear status code de límites y ACL al contrato final (`422/403` según spec locked).
- [x] Alinear `BAD_REQUEST` de validación a `400` en rutas y suites API.
- [x] Cubrir códigos de invitaciones: `INVITE_NOT_FOUND` (`404`) y `INVITE_ALREADY_ACCEPTED` (`409`) en `/api/portfolio/invitations/:id/respond`.
