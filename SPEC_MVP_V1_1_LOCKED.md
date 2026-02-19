# NEXUSFIN MVP v1.1 (Locked Spec)

Fecha de lock: 2026-02-19  
Estado: Aprobado para ejecución

## 1) Scope Lock
- Modo MVP: `strict batch-only`.
- Realtime (`WS` + UI live) fuera de acceptance MVP.
- Recomendación operativa: conservar código realtime detrás de feature flag.
- Flags:
  - Web: `VITE_REALTIME_ENABLED=false`
  - Mobile: `EXPO_PUBLIC_REALTIME_ENABLED=false`

## 2) Product DNA (No ambigüedad)
- Macro-first (`C + E` dominan, `B` filtrado por regime).
- Motores determinísticos calculan señales.
- LLM solo narrativa.
- Regime global y objetivo.
- Perfil de usuario modifica filtro/ranking/tono (no cálculo core).
- Crisis Mode visible, educativo y con reducción de ruido.

## 3) Enums Cerrados (Contrato)

### 3.1 Regime
- `risk_on`
- `risk_off`
- `transition`

### 3.2 Volatility Regime
- `normal`
- `elevated`
- `crisis`

### 3.3 RiskCard Severity
- `low`
- `med`
- `high`

### 3.4 Opportunistic Type (solo opportunistic)
- `value_dislocation`
- `overreaction`
- `macro_divergence`

## 4) ACL de Portfolio (Matriz Final)

Roles: `owner`, `editor`, `viewer`

| Endpoint | Owner | Editor | Viewer |
|---|---|---|---|
| `POST /api/portfolios` | ✅ | ✅ | ✅ |
| `GET /api/portfolios` | ✅ | ✅ | ✅ |
| `GET /api/portfolios/:id` | ✅ | ✅ | ✅ |
| `PUT /api/portfolios/:id/holdings` | ✅ | ✅ | ❌ |
| `POST /api/portfolios/:id/invite` | ✅ | ❌ | ❌ |
| `POST /api/portfolios/:id/accept` | ✅ (self) | ✅ (self) | ✅ (self) |

Regla explícita:
- Solo `owner` invita/gestiona miembros.
- `viewer` read-only.
- No autorizado: `403 FORBIDDEN`.

## 5) Límites de Negocio
- Máximo `3` portfolios por user.
- Máximo `15` holdings por portfolio.
- Máximo `10` bullets en digest.
- Máximo `4` strategic ideas.
- Máximo `3` opportunistic ideas.
- Máximo `4` risk alerts.

## 6) Error Contract Único

### 6.1 Status codes
- `400 BAD_REQUEST` (payload inválido)
- `401 UNAUTHORIZED` (sin auth)
- `403 FORBIDDEN` (ACL)
- `404 NOT_FOUND`
- `409 CONFLICT` (duplicado lógico/idempotency conflict)
- `422 UNPROCESSABLE_ENTITY` (límite de negocio/validación semántica)

### 6.2 Shape obligatorio
```json
{
  "error": {
    "code": "HOLDING_LIMIT_REACHED",
    "message": "Max holdings per portfolio is 15",
    "details": { "limit": 15, "attempted": 16 }
  }
}
```

### 6.3 Códigos mínimos
- `PORTFOLIO_LIMIT_REACHED` -> `422`
- `HOLDING_LIMIT_REACHED` -> `422`
- `DUPLICATE_HOLDING` -> `409`
- `INVALID_ENUM` -> `400`
- `FORBIDDEN_PORTFOLIO_ACTION` -> `403`
- `INVITE_NOT_FOUND` -> `404`
- `INVITE_ALREADY_ACCEPTED` -> `409`

## 7) Idempotencia de Jobs

### 7.1 Regla base
- Todos los jobs usan `run_date=YYYY-MM-DD`.
- Re-run misma fecha no debe duplicar ni desalinear estado.

### 7.2 Keys por tabla (upsert)
- `market_daily_bars`: `(symbol, date)`
- `market_metrics_daily`: `(symbol, date)`
- `fundamentals_snapshot`: `(symbol, asof_date)`
- `fundamentals_derived`: `(symbol, asof_date)`
- `regime_state`: `(date)`
- `crisis_state`: `(date)`
- `base_ideas`: `(date, idea_id)` con replace por fecha
- `daily_digest`: `(user_id, date)` con replace por fecha+user
- `user_recommendations`: `(user_id, date)` con replace por fecha+user
- `portfolio_snapshots`: `(portfolio_id, date)`
- `portfolio_metrics`: `(portfolio_id, date)`

### 7.3 Re-run parcial
- Tablas snapshot: `upsert`.
- Tablas listas (ideas/digest/reco): `replace` por scope de fecha (y user cuando aplique).
- Transacciones por `run_date` (y por `user_id` para digest/reco).

### 7.4 Job control
Tabla `job_runs` recomendada con unique `(job_name, run_date)`:
- `status`: `started|success|failed`
- `started_at`, `finished_at`, `error`

## 8) Guardrails LLM (Narrative-Only)

### 8.1 Campos bloqueados (LLM NO toca)
- `action`
- `confidence`
- `timeframe`
- `invalidation`
- `severity`
- `regime`
- `volatility_regime`
- `tags`

### 8.2 Campos permitidos (LLM sí toca)
- `rationale[]` (refraseo)
- `digest bullets[]` (resumen/priorización)
- `portfolio_ai_notes`
- tono según perfil

### 8.3 Control de salida
- LLM recibe JSON con `narrative_slots`.
- Output validado por schema (solo strings permitidos).
- Fallback determinístico por templates ante fallo.

## 9) Crisis Mode Determinístico

### 9.1 Inputs diarios
- `spy_ret_1d`
- `spy_vol_20d`
- `spy_vol_20d_z`
- `hyg_ief_ret_5d` (si disponible)
- `shock_event_flag`

### 9.2 Volatility regime
- `normal` si `spy_vol_20d_z < 1.0`
- `elevated` si `1.0 <= spy_vol_20d_z < 2.0`
- `crisis` si `spy_vol_20d_z >= 2.0` OR `spy_ret_1d <= -0.03`

### 9.3 Crisis active
- `volatility_regime == crisis`
- OR (`volatility_regime == elevated` AND `shock_event_flag == true`)

### 9.4 shock_event_flag
Tags high-impact permitidos:
- `war`
- `invasion`
- `terror_attack`
- `earthquake_major`
- `bank_failure`
- `default`
- `sanctions_major`

MVP fallback:
- si no hay `reliability_score`, usar whitelist de fuentes.

## 10) Fórmula explícita de Focus Ratio
- `focus ∈ [0,1]`
- `targetStrategicShare = 0.2 + (0.6 * focus)`
- `targetOpportunisticShare = 1 - targetStrategicShare`

Ejemplo:
- `focus=0.2` => strategic `0.32`, opportunistic `0.68`
- `focus=0.8` => strategic `0.68`, opportunistic `0.32`

## 11) DoD Medible (Locked)
- Jobs completan market + fundamentals + regime + crisis + ideas sin edición manual DB.
- `GET /api/news/digest/today`:
  - `bullets.length <= 10`
  - incluye `regime`
  - incluye `crisis.isActive`
- `GET /api/reco/today`:
  - secciones presentes siempre
  - `strategic <= 4`, `opportunistic <= 3`, `riskAlerts <= 4`
  - todas las ideas con `action/confidence/timeframe/invalidation`
- `PUT /api/agent/profile`:
  - cambiar `focus` altera ratio strategic/opportunistic.
- Portfolio limits:
  - 4to portfolio -> `422 PORTFOLIO_LIMIT_REACHED`
  - 16vo holding -> `422 HOLDING_LIMIT_REACHED`
- ACL:
  - viewer en `PUT holdings` -> `403 FORBIDDEN_PORTFOLIO_ACTION`
- Crisis deterministic:
  - fixture `spy_ret_1d=-0.035` => `crisis.isActive=true`

## 12) Seed Dataset Mínimo para Demo
- Universe: al menos 30 símbolos (incluyendo SPY/QQQ/XLK/XLE/TLT/HYG/GLD/USO + 20 equities).
- 2 users.
- 1 portfolio user1 con 5 holdings.
- 1 invite pendiente para user2.
