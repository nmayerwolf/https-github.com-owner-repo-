# NexusFin - Market Data Rebuild Context (for Claude)

Quiero que tomes este estado actual del proyecto y propongas/ejecutes un rediseño limpio del pipeline de market data.

## Objetivo del rediseño
- Fuente única para precios/performance/search: **Twelve Data**
- Sin fallback a Finnhub/Alpha/Yahoo para precios ni performance
- Watchlist robusta: agregar activos siempre funciona y quedan visibles
- Precio y performance diario deben venir del provider, no calcularse localmente
- “Real-time” consistente (o estado explícito de no disponibilidad)

---

## 1) Estructura backend market actual
```bash
nexusfin-api/src/constants/marketUniverse.js
nexusfin-api/src/routes/market.js
nexusfin-api/src/services/alphavantage.js
nexusfin-api/src/services/finnhub.js
nexusfin-api/src/services/marketDataProvider.js
nexusfin-api/src/services/twelvedata.js
nexusfin-api/src/workers/marketCron.js
```

## 2) Servicios actuales
- `nexusfin-api/src/services/twelvedata.js` existe
- `nexusfin-api/src/services/finnhub.js` existe
- `nexusfin-api/src/services/marketAdapter.js` **NO EXISTE**

---

## 3) Market route actual
Archivo completo:
- `nexusfin-api/src/routes/market.js`

Notas:
- Tiene `/quote`, `/snapshot`, `/search`, `/candles`, `/news`, etc.
- Aun conviven lógicas legacy en partes no críticas (candles/news/profile).

---

## 4) Health endpoint
- `nexusfin-api/src/routes/health.js` no existe
- Health está en:
  - `nexusfin-api/src/index.js`
- Incluye:
  - `GET /api/health`
  - `GET /api/health/market-data` (con `liveProbe`)

---

## 5) Frontend que consume market/watchlist
```bash
src/api/apiClient.js
src/api/finnhub.js

src/components/Portfolio.jsx
src/components/Navigation.jsx
src/components/AssetDetail.jsx
src/components/common/AssetRow.jsx
src/components/common/AlertCard.jsx
src/components/News.jsx
src/components/__tests__/News.test.jsx
src/components/NewsSection.jsx
src/components/Alerts.jsx
src/components/Markets.jsx
src/components/Screener.jsx
```

---

## 6) Env vars relacionadas
En `nexusfin-api/.env.example`:
```bash
FINNHUB_KEY=
ALPHA_VANTAGE_KEY=
TWELVE_DATA_KEY=
CRON_MARKET_INTERVAL=5
MARKET_STRICT_REALTIME=true
```

---

## 7) Estado observado en producción (actual)
`GET /api/health/market-data`:
```json
{
  "ok": true,
  "providers": { "finnhub": true, "alphaVantage": true, "twelveData": true },
  "universe": { "count": 98, "hasMerval": true, "hasGoldSpot": true },
  "ws": { "chainResolverEnabled": true },
  "strictRealtime": true,
  "liveProbe": {
    "ok": false,
    "symbol": "AAPL",
    "code": "NO_LIVE_DATA",
    "reason": "LIVE_SOURCE_UNAVAILABLE",
    "message": "No live quote available for AAPL"
  },
  "ts": "2026-02-19T16:25:44.509Z"
}
```

Problemas de usuario:
1. Sigue viendo estados de no disponibilidad/stale en watchlist
2. Agregar activos a watchlist fue inconsistente en varias iteraciones
3. Performance diario no coincide con app Stocks (iPhone)
4. Quiere **una sola fuente confiable** y comportamiento predecible

---

## 8) Qué necesito que hagas (entregable)
1. Replanteo de arquitectura market desde cero (backend + frontend), minimalista y estable.
2. Definir contrato explícito de quote:
   - success con `price`, `previousClose`, `dailyPerformancePct`, `asOf`, `provider`
   - failure con `code` tipado (`KEY_MISSING`, `AUTH_FAILED`, `RATE_LIMITED`, `SYMBOL_UNSUPPORTED`, `NO_LIVE_DATA`)
3. Garantizar que watchlist:
   - agrega siempre en UI (optimistic)
   - persiste backend
   - no desaparece el activo por timing de snapshot
4. Confirmar cómo mapear símbolos:
   - equity (AAPL)
   - fx (EUR_USD <-> EUR/USD)
   - crypto (BTCUSDT <-> BTC/USD)
   - índices (^MERV)
5. Quitar ambigüedad de providers:
   - `providerMode: "twelvedata-only"` en health
   - métricas/diagnóstico claros
6. Tests actualizados:
   - backend market routes + provider adapter
   - frontend watchlist add flow + rendering con/no quote
7. Entregar:
   - lista de archivos tocados
   - diff por archivo
   - pasos de deploy (Railway + Vercel)
   - smoke test final con curls y expected outputs

---

## 9) Restricción funcional clave
No quiero “parches” cosméticos de texto.
Quiero que la fuente de datos y el flujo de watchlist/performance funcionen de forma sólida y coherente end-to-end.
