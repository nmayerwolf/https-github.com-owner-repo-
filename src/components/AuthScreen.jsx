import React, { useMemo, useState } from 'react';
import { useAuth } from '../store/AuthContext';

const toLockoutMessage = (retryAfter) => {
  const seconds = Number(retryAfter);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Demasiados intentos. Esperá 15 minutos.';
  }
  const minutes = Math.ceil(seconds / 60);
  return `Demasiados intentos. Esperá ${minutes} minuto${minutes === 1 ? '' : 's'}.`;
};

const authErrorMessage = (err) => {
  if (!err) return 'No se pudo completar la autenticación.';

  if (err.status === 429) {
    return toLockoutMessage(err.retryAfter || err.details?.retryAfter);
  }

  if (err.status === 401 || err.error === 'INVALID_CREDENTIALS') {
    return 'Email o contraseña incorrectos.';
  }

  if (err.status === 409 || err.error === 'EMAIL_EXISTS') {
    return 'Ya existe una cuenta con ese email.';
  }

  if (err.status === 422 && err.error === 'WEAK_PASSWORD') {
    return 'La contraseña debe tener al menos 8 caracteres, 1 letra y 1 número.';
  }

  if (err.status === 422 && err.error === 'INVALID_EMAIL') {
    return 'Ingresá un email válido.';
  }

  return err.message || 'No se pudo completar la autenticación.';
};

const AuthScreen = () => {
  const { login, register, loading } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');

  const isRegister = mode === 'register';

  const passwordHint = useMemo(
    () => (isRegister ? 'Mínimo 8 caracteres, al menos 1 letra y 1 número.' : null),
    [isRegister]
  );

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (isRegister && password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === 'login') await login(normalizedEmail, password);
      else await register(normalizedEmail, password);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  return (
    <div className="center-screen" style={{ padding: 12 }}>
      <section className="card" style={{ width: 'min(420px, 100%)' }}>
        <h2>{isRegister ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          NexusFin Fase 2
        </p>

        <form onSubmit={submit} className="grid" style={{ marginTop: 10 }}>
          <label className="label">
            <span className="muted">Email</span>
            <input type="email" value={email} required onChange={(e) => setEmail(e.target.value)} placeholder="user@mail.com" />
          </label>

          <label className="label">
            <span className="muted">Contraseña</span>
            <input type="password" value={password} required onChange={(e) => setPassword(e.target.value)} placeholder="********" />
          </label>

          {passwordHint && <p className="muted">{passwordHint}</p>}

          {isRegister && (
            <label className="label">
              <span className="muted">Confirmar contraseña</span>
              <input type="password" value={confirm} required onChange={(e) => setConfirm(e.target.value)} placeholder="********" />
            </label>
          )}

          {error && <div className="card" style={{ borderColor: '#FF4757AA' }}>{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? 'Procesando...' : isRegister ? 'Registrarme' : 'Entrar'}
          </button>
        </form>

        <div className="row" style={{ marginTop: 10 }}>
          <span className="muted">{isRegister ? '¿Ya tenés cuenta?' : '¿No tenés cuenta?'}</span>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setMode(isRegister ? 'login' : 'register');
              setConfirm('');
              setError('');
            }}
          >
            {isRegister ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </div>
      </section>
    </div>
  );
};

export default AuthScreen;
