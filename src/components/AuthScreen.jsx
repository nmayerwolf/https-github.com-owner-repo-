import React, { useEffect, useState } from 'react';
import { useAuth } from '../store/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const AuthScreen = () => {
  const { loading, sessionNotice, clearSessionNotice } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('oauth_error');
    if (!oauthError) return;

    const map = {
      provider_disabled: 'Proveedor OAuth no configurado.',
      invalid_oauth_state: 'Sesión OAuth inválida, intentá nuevamente.',
      google_callback_failed: 'No se pudo completar login con Google.',
      oauth_email_required: 'No se pudo recuperar el email de tu cuenta Google.'
    };

    setError(map[oauthError] || 'Error de autenticación social.');
    params.delete('oauth_error');
    window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
  }, []);

  return (
    <div className="center-screen" style={{ padding: 12 }}>
      <section className="card auth-card" style={{ width: 'min(420px, 100%)' }}>
        <div className="auth-brand">
          <div className="auth-logo" aria-hidden="true">
            H
          </div>
          <h1>Horsy</h1>
        </div>
        <h2 style={{ marginTop: 8 }}>Iniciar sesión con Google</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Accedé con tu cuenta de Google para continuar.
        </p>

        {sessionNotice && <div className="card" style={{ marginTop: 10, borderColor: '#FBBF24AA' }}>{sessionNotice}</div>}

        <div className="grid" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="google-btn"
            onClick={() => {
              setError('');
              clearSessionNotice();
              window.location.href = `${API_BASE}/auth/google`;
            }}
            disabled={loading}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.3-2 3.1l3.2 2.5c1.9-1.7 2.9-4.3 2.9-7.4 0-.7-.1-1.4-.2-2H12z" />
              <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1l-3.3 2.6C4.8 19.8 8.1 22 12 22z" />
              <path fill="#4A90E2" d="M6.4 13.9c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.1 7.5A10 10 0 0 0 2 12c0 1.6.4 3.2 1.1 4.5l3.3-2.6z" />
              <path fill="#FBBC05" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.9 3 14.7 2 12 2 8.1 2 4.8 4.2 3.1 7.5l3.3 2.6c.8-2.4 3-4.2 5.6-4.2z" />
            </svg>
            {loading ? 'Conectando...' : 'Iniciar sesión con Google'}
          </button>
        </div>

        {error && <div className="card" style={{ marginTop: 10, borderColor: '#FF4757AA' }}>{error}</div>}
      </section>
    </div>
  );
};

export default AuthScreen;
