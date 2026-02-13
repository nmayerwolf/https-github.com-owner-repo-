import React, { useState } from 'react';
import { api } from '../api/apiClient';
import { useApp } from '../store/AppContext';

const hasStrongPasswordShape = (value) => value.length >= 8 && /[a-zA-Z]/.test(value) && /[0-9]/.test(value);

const Settings = () => {
  const { state, actions } = useApp();
  const [local, setLocal] = useState(state.config);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError('La nueva contraseña y su confirmación no coinciden.');
      return;
    }

    if (!hasStrongPasswordShape(newPassword)) {
      setPasswordError('La contraseña debe tener al menos 8 caracteres, 1 letra y 1 número.');
      return;
    }

    setPasswordLoading(true);
    try {
      await api.resetPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Contraseña actualizada correctamente.');
    } catch (err) {
      if (err?.error === 'INVALID_CURRENT_PASSWORD') {
        setPasswordError('La contraseña actual es incorrecta.');
      } else if (err?.error === 'WEAK_PASSWORD') {
        setPasswordError(err?.message || 'La nueva contraseña no cumple los requisitos mínimos.');
      } else {
        setPasswordError(err?.message || 'No se pudo actualizar la contraseña. Intentá nuevamente.');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="grid" style={{ gap: 12 }}>
      <div className="card">
        <h2>Configuración</h2>
        <div className="grid grid-2" style={{ marginTop: 8 }}>
          <label className="label">
            <span className="muted">Perfil de riesgo</span>
            <select value={local.riskProfile} onChange={(e) => setLocal({ ...local, riskProfile: e.target.value })}>
              <option value="conservador">conservador</option>
              <option value="moderado">moderado</option>
              <option value="agresivo">agresivo</option>
            </select>
          </label>
          <label className="label">
            <span className="muted">Horizonte</span>
            <select value={local.horizon} onChange={(e) => setLocal({ ...local, horizon: e.target.value })}>
              <option value="corto">corto</option>
              <option value="mediano">mediano</option>
              <option value="largo">largo</option>
            </select>
          </label>
          <label className="label">
            <span className="muted">RSI sobreventa</span>
            <input type="number" value={local.rsiOS} min={15} max={40} onChange={(e) => setLocal({ ...local, rsiOS: Number(e.target.value) })} />
          </label>
          <label className="label">
            <span className="muted">RSI sobrecompra</span>
            <input type="number" value={local.rsiOB} min={60} max={85} onChange={(e) => setLocal({ ...local, rsiOB: Number(e.target.value) })} />
          </label>
          <label className="label">
            <span className="muted">Volumen anómalo (x)</span>
            <input
              type="number"
              step="0.1"
              value={local.volThresh}
              min={1.2}
              max={4}
              onChange={(e) => setLocal({ ...local, volThresh: Number(e.target.value) })}
            />
          </label>
          <label className="label">
            <span className="muted">Confluencia mínima</span>
            <input
              type="number"
              value={local.minConfluence}
              min={1}
              max={5}
              onChange={(e) => setLocal({ ...local, minConfluence: Number(e.target.value) })}
            />
          </label>
        </div>
        <button type="button" onClick={() => actions.setConfig(local)}>
          Guardar y aplicar
        </button>
      </div>

      <div className="card">
        <h2>Seguridad</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Cambiá tu contraseña de acceso.
        </p>

        <form onSubmit={handlePasswordSubmit} className="grid" style={{ marginTop: 10 }}>
          <label className="label">
            <span className="muted">Contraseña actual</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="********"
              required
            />
          </label>

          <label className="label">
            <span className="muted">Nueva contraseña</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="********"
              required
            />
          </label>

          <label className="label">
            <span className="muted">Confirmar nueva contraseña</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="********"
              required
            />
          </label>

          {passwordError && <div className="card" style={{ borderColor: '#FF4757AA' }}>{passwordError}</div>}
          {passwordSuccess && <div className="card" style={{ borderColor: '#00E08E88' }}>{passwordSuccess}</div>}

          <button type="submit" disabled={passwordLoading}>
            {passwordLoading ? 'Actualizando...' : 'Actualizar contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Settings;
