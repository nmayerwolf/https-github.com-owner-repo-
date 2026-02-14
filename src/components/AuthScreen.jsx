import React, { useEffect, useState } from 'react';
import { useAuth } from '../store/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const AuthScreen = () => {
  const { login, register, loading, sessionNotice, clearSessionNotice } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('oauth_error');
    if (!oauthError) return;

    const map = {
      provider_disabled: 'Proveedor OAuth no configurado.',
      invalid_oauth_state: 'Sesión OAuth inválida, intentá nuevamente.',
      google_callback_failed: 'No se pudo completar login con Google.',
      apple_callback_failed: 'No se pudo completar login con Apple.',
      oauth_email_required: 'Apple no entregó email. Reintentá compartiendo tu email con la app.',
      apple_not_implemented: 'Sign in with Apple no disponible en esta build.'
    };

    setError(map[oauthError] || 'Error de autenticación social.');
    params.delete('oauth_error');
    window.history.replaceState({}, '', `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    clearSessionNotice();

    if (mode === 'register' && password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
    } catch (err) {
      if (err?.error === 'USE_OAUTH_LOGIN') {
        setError('Esta cuenta usa login social. Entrá con Google o Apple.');
      } else {
        setError(err?.message || 'No se pudo completar la autenticación.');
      }
    }
  };

  return (
    <div className="center-screen" style={{ padding: 12 }}>
      <section className="card" style={{ width: 'min(420px, 100%)' }}>
        <h2>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          NexusFin Fase 3
        </p>

        {sessionNotice && <div className="card" style={{ marginTop: 10, borderColor: '#FBBF24AA' }}>{sessionNotice}</div>}

        <div className="grid" style={{ marginTop: 10 }}>
          <button type="button" onClick={() => (window.location.href = `${API_BASE}/auth/google`)} disabled={loading}>
            Continuar con Google
          </button>
          <button type="button" onClick={() => (window.location.href = `${API_BASE}/auth/apple`)} disabled={loading}>
            Continuar con Apple
          </button>
        </div>

        <div className="row" style={{ marginTop: 10, justifyContent: 'center' }}>
          <span className="muted">o con email</span>
        </div>

        <form onSubmit={submit} className="grid" style={{ marginTop: 10 }}>
          <label className="label">
            <span className="muted">Email</span>
            <input type="email" value={email} required onChange={(e) => setEmail(e.target.value)} placeholder="user@mail.com" />
          </label>

          <label className="label">
            <span className="muted">Contraseña</span>
            <input type="password" value={password} required onChange={(e) => setPassword(e.target.value)} placeholder="********" />
          </label>

          {mode === 'register' && (
            <label className="label">
              <span className="muted">Confirmar contraseña</span>
              <input type="password" value={confirm} required onChange={(e) => setConfirm(e.target.value)} placeholder="********" />
            </label>
          )}

          {error && <div className="card" style={{ borderColor: '#FF4757AA' }}>{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Procesando...' : mode === 'login' ? 'Entrar' : 'Registrarme'}
          </button>
        </form>

        <div className="row" style={{ marginTop: 10 }}>
          <span className="muted">{mode === 'login' ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?'}</span>
          <button
            type="button"
            onClick={() => {
              clearSessionNotice();
              setMode(mode === 'login' ? 'register' : 'login');
            }}
          >
            {mode === 'login' ? 'Crear cuenta' : 'Iniciar sesión'}
          </button>
        </div>
      </section>
    </div>
  );
};

export default AuthScreen;
