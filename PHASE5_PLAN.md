# PHASE 5 PLAN (Kickoff)

Fecha: 2026-02-17  
Estado: iniciado  
Base: cierre técnico de Fase 4 en `codex/release-notes-v1`

## 1) Objetivo de Fase 5

Enfocar Fase 5 en producto y calidad operacional:

- UX/UI consistente web + mobile (flujos críticos sin fricción).
- Robustez de tiempo real (mercados, alertas, WS) bajo condiciones reales.
- Escalado del AI Agent hacia experiencia de asesoría continua.
- Cierre release-ready con trazabilidad clara para PRs grandes por bloque.

## 2) Alcance inicial (propuesto)

## Bloque 1: Stabilización UX y runtime (P0)

1. eliminar errores visuales y desbordes en tabs/pantallas críticas.
2. reducir fricción de login/OAuth y estados de sesión expirada.
3. mejorar resiliencia de mercados:
   - degradación controlada con cache,
   - evitar ruido de errores repetidos al usuario.
4. hardening de componentes de detalle AI (payloads incompletos o variantes).

## Bloque 2: AI Agent Product Surface (P1)

1. reforzar “Señales + Tesis” con contexto accionable y lectura clara.
2. mejorar legibilidad de performance AI (resúmenes y filtros útiles).
3. consolidar entrada principal del agente y jerarquía de módulos.

## Bloque 3: Operación release (P1)

1. alinear branch de trabajo con `main` sin conflictos.
2. PR final por bloque con checks verdes.
3. ejecutar release operativo mobile (build+submit+smoke real).

## 3) Estado actual al iniciar Fase 5

- Fase 4 está implementada en código, con pendientes operativos de release.
- Últimos fixes incluidos en esta branch:
  - web: ancho/overflow + notificaciones ajustes + hardening tesis AI.
  - mobile: settings con scroll estable + tabs inferiores robustas.

## 4) Criterios de salida de Fase 5 (draft)

- UX consistente en pantallas core (Agente IA, Mercados, Cartera, Ajustes, Noticias).
- sin errores bloqueantes en runtime local (web/api/mobile).
- CI verde para bloque(s) de Fase 5.
- documentación de cierre y runbook actualizados.

## 5) Nota de coordinación

Todavía no hay spec formal de Fase 5 en repo/Downloads.  
Este plan sirve como kickoff operativo para avanzar sin bloquear ejecución.
