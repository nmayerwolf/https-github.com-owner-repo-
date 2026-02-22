#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const FILES = {
  web: path.join(ROOT, '.env.production.example'),
  api: path.join(ROOT, 'nexusfin-api', '.env.production.example'),
  mobile: path.join(ROOT, 'nexusfin-mobile', '.env.production.example')
};

const readEnvFile = (filePath) => {
  const out = {};
  const raw = fs.readFileSync(filePath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    out[key] = value;
  });
  return out;
};

const parseUrl = (name, value, errors) => {
  if (!value) {
    errors.push(`${name} está vacío`);
    return null;
  }
  try {
    return new URL(value);
  } catch {
    errors.push(`${name} no es una URL válida: ${value}`);
    return null;
  }
};

const sameHost = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

const validate = () => {
  const errors = [];
  const warnings = [];

  Object.entries(FILES).forEach(([label, filePath]) => {
    if (!fs.existsSync(filePath)) {
      errors.push(`Falta archivo ${label}: ${filePath}`);
    }
  });
  if (errors.length) return { errors, warnings };

  const web = readEnvFile(FILES.web);
  const api = readEnvFile(FILES.api);
  const mobile = readEnvFile(FILES.mobile);

  const webApi = parseUrl('VITE_API_URL', web.VITE_API_URL, errors);
  const webWs = parseUrl('VITE_WS_URL', web.VITE_WS_URL, errors);
  const frontend = parseUrl('FRONTEND_URL', api.FRONTEND_URL, errors);
  const callback = parseUrl('GOOGLE_CALLBACK_URL', api.GOOGLE_CALLBACK_URL, errors);
  const mobileApi = parseUrl('EXPO_PUBLIC_API_URL', mobile.EXPO_PUBLIC_API_URL, errors);
  const cookieDomain = String(api.COOKIE_DOMAIN || '').trim();

  if (webApi && !webApi.pathname.endsWith('/api')) {
    errors.push(`VITE_API_URL debe terminar en /api: ${web.VITE_API_URL}`);
  }
  if (webWs && !webWs.pathname.endsWith('/ws')) {
    errors.push(`VITE_WS_URL debe terminar en /ws: ${web.VITE_WS_URL}`);
  }
  if (callback && callback.pathname !== '/api/auth/google/callback') {
    errors.push(`GOOGLE_CALLBACK_URL debe ser /api/auth/google/callback: ${api.GOOGLE_CALLBACK_URL}`);
  }

  if (webApi && webWs) {
    const expectedWsProtocol = webApi.protocol === 'https:' ? 'wss:' : 'ws:';
    if (webWs.protocol !== expectedWsProtocol) {
      errors.push(`VITE_WS_URL debe usar protocolo ${expectedWsProtocol} cuando VITE_API_URL es ${webApi.protocol}`);
    }
    if (!sameHost(webApi.host, webWs.host)) {
      errors.push('VITE_API_URL y VITE_WS_URL deben apuntar al mismo host');
    }
  }

  if (webApi && callback && !sameHost(webApi.host, callback.host)) {
    errors.push('VITE_API_URL y GOOGLE_CALLBACK_URL deben compartir host de API');
  }
  if (webApi && mobileApi && !sameHost(webApi.host, mobileApi.host)) {
    errors.push('VITE_API_URL y EXPO_PUBLIC_API_URL deben compartir host de API');
  }
  if (frontend && String(frontend.protocol) !== 'https:') {
    warnings.push('FRONTEND_URL en producción debería usar https');
  }

  if (!cookieDomain) {
    warnings.push('COOKIE_DOMAIN está vacío; en producción se recomienda setearlo');
  } else {
    if (cookieDomain.includes('://') || cookieDomain.includes('/')) {
      errors.push(`COOKIE_DOMAIN no debe incluir protocolo ni path: ${cookieDomain}`);
    }
    if (frontend && !(sameHost(frontend.hostname, cookieDomain) || frontend.hostname.endsWith(`.${cookieDomain}`))) {
      errors.push(`COOKIE_DOMAIN (${cookieDomain}) no es compatible con FRONTEND_URL host (${frontend.hostname})`);
    }
  }

  return { errors, warnings };
};

const main = () => {
  const { errors, warnings } = validate();
  if (warnings.length) {
    console.log('[integration-doctor] warnings:');
    warnings.forEach((line) => console.log(`  - ${line}`));
  }

  if (errors.length) {
    console.error('[integration-doctor] errors:');
    errors.forEach((line) => console.error(`  - ${line}`));
    process.exit(1);
  }

  console.log('[integration-doctor] OK: configuración web/api/mobile + DNS consistente');
};

main();
