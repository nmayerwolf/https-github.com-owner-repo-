import React, { useEffect, useState } from 'react';
import { useAuth } from '../store/AuthContext';
import { getApiBaseUrl } from '../api/env';
import HorsaiHorseIcon from './common/HorsaiHorseIcon';

const API_BASE = getApiBaseUrl();

const OAUTH_ERROR_MAP = {
  provider_disabled: 'Google OAuth no está configurado en backend.',
  invalid_oauth_state: 'Sesión OAuth inválida. Reintentá el ingreso.',
  google_callback_failed: 'No se pudo completar login con Google.',
  gmail_only: 'Solo se permiten cuentas Gmail para ingresar.',
  oauth_email_required: 'No se pudo recuperar el email de tu cuenta Google.',
  invalid_client: 'El cliente OAuth de Google es inválido o no existe.',
  access_denied: 'Cancelaste el acceso con Google.',
  server_error: 'Google devolvió un error temporal de autenticación.'
};

const formatOAuthError = (oauthError, oauthErrorDescription = '') => {
  const normalized = String(oauthError || '').trim().toLowerCase();
  const description = String(oauthErrorDescription || '').trim();
  const fromMap = OAUTH_ERROR_MAP[normalized] || 'Error de autenticación social.';

  if (description) {
    return `${fromMap} (${description})`;
  }
  return fromMap;
};

const AuthScreen = () => {
  const { loading, sessionNotice, clearSessionNotice, completeOAuthWithToken } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauth = params.get('oauth');
    const token = params.get('token');
    const oauthError = params.get('oauth_error');
    const oauthErrorDescription = params.get('oauth_error_description');

    const cleanUrl = () => {
      params.delete('oauth');
      params.delete('provider');
      params.delete('token');
      params.delete('oauth_error');
      params.delete('oauth_error_description');
      window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
    };

    if (oauth === 'success' && token && typeof completeOAuthWithToken === 'function') {
      completeOAuthWithToken(token).then((ok) => {
        if (!ok) setError('No se pudo completar login con Google. (token inválido)');
      });
      cleanUrl();
      return;
    }

    if (oauthError) {
      setError(formatOAuthError(oauthError, oauthErrorDescription));
      cleanUrl();
    }
  }, [completeOAuthWithToken]);

  const tickerRows = [
    { symbol: 'AAPL', price: '263.04', move: '-2.27%', tone: 'dn' },
    { symbol: 'NVDA', price: '457.00', move: '+3.41%', tone: 'up' },
    { symbol: 'BTC', price: '97,234', move: '+1.82%', tone: 'up' },
    { symbol: 'ETH', price: '2,721', move: '-0.54%', tone: 'dn' },
    { symbol: 'GOLD', price: '2,918', move: '+0.32%', tone: 'up' },
    { symbol: 'S&P', price: '6,025', move: '+0.18%', tone: 'up' },
    { symbol: 'EUR', price: '1.047', move: '-0.11%', tone: 'dn' }
  ];

  const openGoogle = () => {
    setError('');
    clearSessionNotice();
    window.location.href = `${API_BASE}/auth/google`;
  };

  return (
    <div className="auth-landing">
      <div className="auth-glow-1" />
      <div className="auth-glow-2" />
      <div className="auth-grid-pattern" />

      <section className="auth-container">
        <div className="auth-horse-container">
          <div className="auth-horse-glow" />
          <HorsaiHorseIcon className="auth-horse-svg" />
        </div>

        <div className="auth-brand">
          <h1 className="auth-logo-wordmark">Horsai</h1>
          <p className="auth-tagline">
            Your market intelligence <span className="tagline-highlight">in real time</span>
          </p>
        </div>

        <div className="auth-login-card">
          <button type="button" className="google-btn" onClick={openGoogle} disabled={loading}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            {loading ? 'Conectando...' : 'Continuar con Google'}
          </button>

          <div className="card-note">Usamos tu cuenta de Google para crear tu perfil de forma segura y rápida.</div>
          <div className="card-note">Acceso habilitado solo para cuentas Gmail.</div>
          {sessionNotice ? <div className="auth-alert auth-alert-warn">{sessionNotice}</div> : null}
          {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}
          {error ? (
            <button
              type="button"
              className="auth-retry-btn"
              onClick={openGoogle}
              disabled={loading}
            >
              Reintentar con Google
            </button>
          ) : null}
        </div>

        <footer className="auth-footer">
          Al continuar, aceptás los <a href="#" onClick={(event) => event.preventDefault()}>Términos de servicio</a> y la{' '}
          <a href="#" onClick={(event) => event.preventDefault()}>Política de privacidad</a>
        </footer>
      </section>

      <div className="auth-ticker">
        <div className="auth-ticker-inner">
          {[...tickerRows, ...tickerRows].map((item, idx) => (
            <div key={`${item.symbol}-${idx}`} className="tk">
              <span className="tk-s">{item.symbol}</span>
              <span className="tk-p">{item.price}</span>
              <span className={item.tone === 'up' ? 'tk-up' : 'tk-dn'}>{item.move}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
