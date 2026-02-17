# PHASE 4 RELEASE CHECKLIST

Fecha: 2026-02-17

## 1) Código y CI

- [ ] PR de fase4 en verde (web, api, e2e).
- [ ] `./scripts/phase4_gate.sh` en verde local.
- [ ] Sin conflictos contra `main`.
- [ ] `PHASE4_CLOSEOUT.md` actualizado.
- [ ] Sprint AI Agent v2 validado en UI/API (Macro + Portfolio Advisor + outcomes por ventana).

## 2) Seguridad

- [ ] Auth web por cookie `httpOnly` y CSRF en mutaciones verificado.
- [ ] Password reset (`forgot/reset`) validado.
- [ ] Scan de bundle sin secretos (`check:bundle-secrets`) verificado.

## 3) Realtime y jobs

- [ ] WS hub autenticado (`/ws`) validado con subscribe/unsubscribe.
- [ ] Cron (`/api/health/cron`) reporta `enabled=true`.
- [ ] Outcome evaluation visible en alertas.
- [ ] Outcome windows (`24h/7d/30d`) visibles en rendimiento.
- [ ] Macro Radar operativo (`GET/POST /api/alerts/macro`).
- [ ] Portfolio Advisor operativo (`GET/POST /api/alerts/portfolio-advice`).

## 4) Mobile release

- [ ] Config Expo/EAS presente (`app.json`, `eas.json`).
- [ ] Assets mobile presentes (`icon/adaptive/splash`).
- [ ] Metadata store (`APP_STORE_METADATA.md`) revisada.
- [ ] `eas build` iOS producción ejecutado.
- [ ] `eas build` Android producción ejecutado.
- [ ] Submit a TestFlight ejecutado.
- [ ] Submit a Play Internal ejecutado.
- [ ] `npm -C /Users/nmayerwolf/Documents/nexusfin/nexusfin-mobile run release:store` ejecutado y log guardado en `nexusfin-mobile/release-logs/`.

## 5) Evidencia para auditoría

- [ ] Generar bundle: `./scripts/phase4_release_pack.sh`
- [ ] Adjuntar `/Users/nmayerwolf/Documents/nexusfin/PHASE4_AUDIT_BUNDLE.md` al hand-off.
