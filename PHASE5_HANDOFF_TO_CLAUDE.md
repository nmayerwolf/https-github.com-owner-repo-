# HORSAI — HANDOFF STATUS (para ajustes finales con Claude)

## 1) Estado actual (implementado)

### Navegación / estructura
- App con tabs activas: Agente IA, Mercados, Cartera, Noticias, Ajustes.
- Branding actualizado a **Horsai**.

### Noticias (cambio fuerte)
- Sección Noticias ahora tiene:
  1. **Recomendadas por IA**
  2. **Todas las noticias**
- Ambas listas tienen buscador independiente.
- Recomendadas IA:
  - filtro estricto de relevancia de mercado,
  - ventana de últimas **48h**,
  - cobertura global (no solo USA),
  - scoring más robusto (macro/geopolítica/commodities/fx/crypto/equity),
  - badge de relevancia (`Muy relevante`, `Relevante`, `Poco relevante`),
  - tag de temática (`Macro`, `Geopolítica`, `Commodities`, `FX`, `Crypto`, `Equity`, `Global`).

### Notificaciones (campanita)
- Campanita ahora muestra solo notificaciones importantes:
  - SL/TP,
  - invitaciones de portfolio,
  - eventos críticos de sesión/conexión.
- Deduplicación + limitación anti-ruido.
- Badge de no leídas + panel de notificaciones.
- Notificaciones accionables (navegan a sección correspondiente).

### Ajustes / Onboarding (simplificación solicitada)
- **Perfil inversor oculto** en Ajustes.
- **Agente IA oculto** en Ajustes.
- Ajustes ahora enfocado en:
  - Cuenta (tema),
  - Notificaciones,
  - Seguridad (cambio contraseña).
- Onboarding inicial simplificado:
  - ya no pregunta perfil/sectores/horizonte,
  - solo push opcional + finalizar onboarding.

### Cartera (resumen)
- Gestión de múltiples portfolios + colaboración/invitaciones ya implementada.
- UI de portfolios rediseñada y más prolija.
- Reglas de creación/eliminación y colaboración activas según lo pedido.

---

## 2) Backend touchpoints relevantes
- `nexusfin-api/src/services/newsRanker.js`  
  - scoring de noticias mejorado + clasificación temática + diversificación por tema.
- `nexusfin-api/src/routes/market.js`  
  - endpoint recomendado ampliado para usar fuentes `general + forex + crypto` (+ company/watchlist cuando aplica).
- Endpoint recomendado soporta parámetros de curaduría más estricta (`maxAgeHours`, `strictImpact`, etc).

---

## 3) Frontend touchpoints relevantes
- `src/components/News.jsx`  
  - doble lista (Recomendadas IA + Todas), búsqueda en ambas, badges y tags.
- `src/App.jsx`  
  - campanita con bandeja de notificaciones importantes + navegación accionable.
  - onboarding simplificado.
- `src/components/Settings.jsx`  
  - ocultado perfil inversor y bloque Agente IA.

---

## 4) Calidad / validación
- `npm run check` en frontend: ✅ OK
- tests frontend en verde: ✅
- build frontend en verde: ✅
- check de secretos en bundle: ✅ OK

---

## 5) Pendientes sugeridos para cierre final (si Claude quiere pulir)
1. Revisar copy final de textos de Noticias y Ajustes para tono producto.
2. Ajustar umbrales de relevancia IA (minScore / weights) con datos reales de producción.
3. Opcional: persistir preferencias UI de Noticias (ej: última búsqueda).
4. Opcional: analytics de CTR en noticias recomendadas para mejorar curaduría.
5. QA manual final cross-device (desktop + mobile).
