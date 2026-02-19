# MVP SQL Migration Checklist v1.1

Objetivo: llevar el esquema actual a la especificación `SPEC_MVP_V1_1_LOCKED.md` sin romper compatibilidad incremental.

## A) Reglas de ejecución
- Ejecutar migraciones en entorno staging primero.
- Toda migración debe ser idempotente (`IF NOT EXISTS`, guards de constraints/índices).
- Para cambios destructivos, usar estrategia expand/migrate/contract (no hard cut).

## B) Estructuras nuevas mínimas (MVP strict)

### 1. Job control
- [x] Crear `job_runs`:
  - columnas: `id`, `job_name`, `run_date`, `status`, `started_at`, `finished_at`, `error`
  - unique: `(job_name, run_date)`
  - índices por `status`, `run_date`.

### 2. Agent profile
- [x] Crear/ajustar `user_agent_profile`:
  - `preset_type` enum/value check: `strategic_core|balanced|opportunistic`
  - `risk_level NUMERIC` check `[0,1]`
  - `horizon NUMERIC` check `[0,1]`
  - `focus NUMERIC` check `[0,1]`
  - unique por `user_id`.

### 3. Portfolio ACL y límites
- [x] Asegurar tabla de colaboradores con rol (`portfolio_collaborators`):
  - `role` check `editor|viewer` (owner deriva de `portfolios.user_id`)
  - unique `(portfolio_id, user_id)`.
- [x] Límite 3 portfolios por user:
  - enforcement en app + opcional trigger defensivo DB.
- [x] Límite 15 holdings por portfolio:
  - enforcement en app + opcional trigger defensivo DB.
- [x] Unique lógico holding:
  - unique parcial recomendado `(portfolio_id, symbol)` para holding activo.

### 4. Regime y crisis diarios
- [x] `regime_state` unique `(date)`.
- [x] `crisis_state` unique `(date)`.
- [x] checks de enum:
  - `regime`: `risk_on|risk_off|transition`
  - `volatility_regime`: `normal|elevated|crisis`.

### 5. Digest y recomendaciones diarios
- [x] `daily_digest` unique `(user_id, date)`.
- [x] `user_recommendations` unique `(user_id, date)`.
- [x] columnas JSON/JSONB para secciones y metadata de crisis/regime.

### 6. Market/fundamentals snapshots
- [x] `market_daily_bars` unique `(symbol, date)`.
- [x] `market_metrics_daily` unique `(symbol, date)`.
- [x] `fundamentals_snapshot` unique `(symbol, asof_date)`.
- [x] `fundamentals_derived` unique `(symbol, asof_date)`.

### 7. Portfolio snapshots
- [x] `portfolio_snapshots` unique `(portfolio_id, date)`.
- [x] `portfolio_metrics` unique `(portfolio_id, date)`.

## C) Constraints de contratos de salida

### 1. Ideas (base/user)
- [x] `action` check `BUY|SELL|WATCH`.
- [x] `confidence` check `[0,1]`.
- [x] `timeframe` check `weeks|months`.
- [x] límites por categoría (en capa app + validación):
  - [x] strategic max 4
  - [x] opportunistic max 3
  - [x] risk max 4.

### 2. Risk severity
- [x] check `low|med|high`.

### 3. Opportunistic type
- [x] check `value_dislocation|overreaction|macro_divergence` (nullable fuera de opportunistic).

## D) Migración de datos existentes
- [ ] Backfill `portfolio_collaborators.role`:
  - default `editor` para collaborators históricos.
  - owner no se almacena como collaborator (deriva de portfolios.user_id) o registrar explícitamente según diseño final.
- [ ] Normalizar recommendations históricas para compatibilidad de contrato (si aplica).
- [ ] Validar no existan portfolios >3 o holdings >15 antes de habilitar validaciones estrictas.

## E) Validación post-migración
- [x] `npm test` en `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api`.
- [ ] smoke SQL:
  - inserción duplicada en keys únicas debe fallar.
  - upsert por `run_date` debe funcionar sin duplicar.
- [ ] ejecutar un re-run de job para misma fecha y verificar idempotencia.

## F) Rollout
- [ ] Deploy migraciones.
- [ ] Deploy app/backend con `REALTIME_ENABLED=false`.
- [ ] Ejecutar seed mínimo de demo.
- [ ] Ejecutar matriz de tests de aceptación MVP.
