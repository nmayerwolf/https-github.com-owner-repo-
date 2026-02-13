import React, { useState } from 'react';
import { useAuth } from '../store/AuthContext';

const AuthScreen = () => {
  const { login, register, loading, sessionNotice, clearSessionNotice } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

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
      setError(err?.message || 'No se pudo completar la autenticación.');
    }
  };

  return (
    <div className="center-screen" style={{ padding: 12 }}>
      <section className="card" style={{ width: 'min(420px, 100%)' }}>
        <h2>{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          NexusFin Fase 2
        </p>

        {sessionNotice && <div className="card" style={{ marginTop: 10, borderColor: '#FBBF24AA' }}>{sessionNotice}</div>}

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
