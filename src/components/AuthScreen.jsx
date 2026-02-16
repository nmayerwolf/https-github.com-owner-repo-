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
      <section className="card" style={{ width: 'min(420px, 100%)' }}>
        <h2>Continuar con Google</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Ingreso único con cuenta de Google.
        </p>

        {sessionNotice && <div className="card" style={{ marginTop: 10, borderColor: '#FBBF24AA' }}>{sessionNotice}</div>}

        <div className="grid" style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => {
              setError('');
              clearSessionNotice();
              window.location.href = `${API_BASE}/auth/google`;
            }}
            disabled={loading}
          >
            Continuar con Google
          </button>
        </div>

        {error && <div className="card" style={{ marginTop: 10, borderColor: '#FF4757AA' }}>{error}</div>}
      </section>
    </div>
  );
};

export default AuthScreen;
