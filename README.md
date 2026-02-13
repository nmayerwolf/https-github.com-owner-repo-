# NexusFin (Phase 1 MVP)

Implementación inicial basada en `nexusfin-spec.md`.

## Incluye

- React + Vite + React Router
- Carga secuencial de watchlist con Finnhub
- WebSocket Finnhub para updates en vivo de equities (reconexión automática)
- Carga background de macro assets (metales/commodities/bonos) con Alpha Vantage + cache local
- Motor técnico: RSI, MACD, Bollinger, SMA50/200, ATR, volumen anómalo
- Confluencia BUY/SELL/HOLD + alertas + SL/TP ATR adaptativo
- Dashboard, Markets, Asset Detail, Alerts, Portfolio, Settings, Screener
- AI Thesis desde alertas con JSON estructurado (fallback local)
- Watchlist editable (agregar/quitar) persistida en localStorage
- Persistencia local de portfolio/configuración/watchlist

## Ejecutar

```bash
npm install
npm run dev
```

## Calidad

```bash
npm test
npm run test:coverage
npm run build
```

## CI (GitHub Actions)

Pipeline en `/Users/nmayerwolf/Documents/nexusfin/.github/workflows/ci.yml`:

- Job `test` (Node `20.x` y `22.x`):
  - `npm ci`
  - `npm run test:coverage`
- Job `build` (Node `20.x`, depende de `test`):
  - `npm ci`
  - `npm run build`

Además:

- `workflow_dispatch` habilitado para ejecución manual
- `concurrency` para cancelar runs anteriores del mismo branch/PR
- permisos mínimos (`contents: read`)

## PR Template

Template en `/Users/nmayerwolf/Documents/nexusfin/.github/pull_request_template.md` con checklist obligatorio de calidad.

## Variables opcionales

```bash
VITE_FINNHUB_KEY=...
VITE_ALPHA_VANTAGE_KEY=...
VITE_ANTHROPIC_KEY=...
```

Si no se define `VITE_ANTHROPIC_KEY`, el Screener y AI Thesis usan fallback local.
