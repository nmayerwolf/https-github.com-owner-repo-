# NexusFin MVP - UX/UI Review Brief for Claude

## 1) Context
Estamos cerrando MVP de NexusFin con backend en producción (batch-only) y login social Google con restricción Gmail-only.

Estado técnico actual:
- Backend MVP desplegado y smoke en producción: OK.
- Endpoints MVP disponibles:
  - `GET /api/news/digest/today`
  - `GET /api/reco/today`
  - `GET /api/crisis/today`
  - `GET/PUT /api/agent/profile`
  - `GET/POST/PUT /api/portfolios*` (incluye invite/accept y holdings)
- Auth:
  - Google OAuth only
  - Gmail-only enforced (`gmail_only`)
  - register/login/reset por email deshabilitado

Frontend actual:
- Web: `src/` (React + Vite)
- Mobile: `nexusfin-mobile/` (React Native + Expo SDK 52)

## 2) Goal
Queremos una propuesta UX/UI clara, consistente y ejecutable para dejar el MVP visualmente sólido y coherente con el producto.

Enfocarse en:
1. Claridad de producto (qué es estratégico vs oportunístico vs riesgo).
2. Priorización de información (menos ruido, más decisiones accionables).
3. Legibilidad y jerarquía de datos críticos.
4. Flujo onboarding/login consistente con Gmail-only.
5. Coherencia web + mobile.

## 3) Product Principles (no negociar)
- Macro-first.
- Recomendaciones estratégicas dominan; oportunísticas complementan.
- Crisis Mode visible y educativo.
- LLM solo narrativa (no cálculo de señales).
- Sin Markets tab como requisito MVP de producto (si proponés mantenerlo, justificar transición y flags).

## 4) Scope to Review
### A. Auth
- Pantalla login:
  - “Continuar con Google”
  - Mensajes de error OAuth claros (`gmail_only`, `invalid_oauth_state`, etc.)
  - Comunicación explícita: solo cuentas Gmail

### B. Home / Dashboard (mobile y web)
- Debe mostrar:
  - Estado de crisis
  - Resumen digest (bullets)
  - Resumen recomendaciones (strategic/opportunistic/risk)

### C. Recomendaciones
- Secciones separadas:
  - Strategic
  - Opportunistic
  - Risk Alerts
- Cada card debe priorizar:
  - acción, confianza, timeframe, invalidation, rationale breve, riesgos

### D. News Digest
- Lectura rápida + escaneable.
- Máx 10 bullets.
- Siempre incluir:
  - Regime Today
  - Leadership/themes
  - Key risks

### E. Portfolios
- Estado del portfolio, exposición, alignment score y notas.
- Acciones colaborativas (invite/accept) claras según rol.

### F. Crisis Mode
- Banner y tono adaptativo.
- Cambios de comportamiento visibles (menos ideas, más riesgo, umbral alto).

## 5) Constraints
- No rediseño total de arquitectura.
- Mantener contratos API ya existentes.
- Cambios propuestos deben ser implementables en fases (quick wins + medium).
- Evitar “AI slop” visual; necesitamos dirección visual intencional.

## 6) Deliverables Requested from Claude
Pedir exactamente esto:

1. **UX/UI Audit**
- Top issues (P0/P1/P2) con impacto en negocio/producto.
- Qué confunde hoy y por qué.

2. **Information Architecture Proposal**
- Estructura de navegación web y mobile para MVP.
- Qué entra/sale de cada pantalla.

3. **Wireframe-level Proposal (textual)**
- Layout por pantalla:
  - Auth
  - Dashboard
  - News
  - Recommendations
  - Portfolio
  - Settings/Agent profile

4. **Design System Direction**
- Tipografía, color, spacing, componentes clave.
- Estados (normal / elevated / crisis).
- Tokens sugeridos y reglas de uso.

5. **Implementation Plan**
- Sprint 1 (rápido, 3-5 días): quick wins UX.
- Sprint 2 (1-2 semanas): mejoras estructurales.
- Lista de componentes/archivos a tocar (web + mobile).

6. **Acceptance Checklist**
- Criterios verificables para considerar UX/UI MVP “release-ready”.

## 7) Output Format Required
Responder en español con:
- Resumen ejecutivo (máx 10 líneas)
- Hallazgos priorizados (P0/P1/P2)
- Propuesta de IA y navegación
- Propuesta por pantalla
- Plan de implementación por fases
- Checklist final de aceptación

## 8) Repo References (optional for Claude)
- Web: `/Users/nmayerwolf/Documents/nexusfin/src`
- Mobile: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile/src`
- API contracts: `/Users/nmayerwolf/Documents/nexusfin/nexusfin-api/src/routes`
- Product/spec docs:
  - `/Users/nmayerwolf/Documents/nexusfin/SPEC_MVP_V1_1_LOCKED.md`
  - `/Users/nmayerwolf/Documents/nexusfin/PHASE6_CLOSEOUT.md`
  - `/Users/nmayerwolf/Documents/nexusfin/PHASE6_PR_PACKAGE.md`
