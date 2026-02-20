import React, { useEffect, useState } from 'react';
import { api } from '../api/apiClient';
import { subscribeBrowserPush } from '../lib/notifications';
import { useTheme } from '../store/ThemeContext';

const hasStrongPasswordShape = (value) => value.length >= 8 && /[a-zA-Z]/.test(value) && /[0-9]/.test(value);
const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';

const Settings = () => {
  const { theme, setTheme } = useTheme();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [notifLoading, setNotifLoading] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSubscribing, setNotifSubscribing] = useState(false);
  const [notifError, setNotifError] = useState('');
  const [notifSuccess, setNotifSuccess] = useState('');
  const [notif, setNotif] = useState({
    stopLoss: true,
    opportunities: true,
    regimeChanges: true,
    quietHoursStart: '',
    quietHoursEnd: ''
  });
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const prefs = await api.getNotificationPreferences();
        if (!mounted) return;
        setNotif({
          stopLoss: prefs.stopLoss ?? true,
          opportunities: prefs.opportunities ?? true,
          regimeChanges: prefs.groupActivity ?? true,
          quietHoursStart: prefs.quietHoursStart || '',
          quietHoursEnd: prefs.quietHoursEnd || ''
        });
      } catch {
        if (!mounted) return;
        setNotifError('No se pudieron cargar preferencias de notificaciones.');
      } finally {
        if (mounted) setNotifLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, []);

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

  const handleSaveNotif = async () => {
    setNotifError('');
    setNotifSuccess('');
    setNotifSaving(true);

    try {
      const updated = await api.updateNotificationPreferences({
        stopLoss: notif.stopLoss,
        opportunities: notif.opportunities,
        groupActivity: notif.regimeChanges,
        quietHoursStart: notif.quietHoursStart || null,
        quietHoursEnd: notif.quietHoursEnd || null
      });

      setNotif({
        stopLoss: updated.stopLoss,
        opportunities: updated.opportunities,
        regimeChanges: updated.groupActivity,
        quietHoursStart: updated.quietHoursStart || '',
        quietHoursEnd: updated.quietHoursEnd || ''
      });
      setNotifSuccess('Preferencias de notificación guardadas.');
    } catch (err) {
      setNotifError(err?.message || 'No se pudieron guardar las preferencias.');
    } finally {
      setNotifSaving(false);
    }
  };

  const handleEnablePush = async () => {
    setNotifError('');
    setNotifSuccess('');
    setNotifSubscribing(true);

    try {
      const out = await subscribeBrowserPush();
      if (!out.ok) {
        const reasonMap = {
          UNSUPPORTED: 'Tu navegador no soporta Web Push.',
          DENIED: 'Permiso de notificaciones denegado.',
          NO_REGISTRATION: 'No se pudo registrar el service worker.',
          PUSH_DISABLED: 'Push no está habilitado en backend (faltan VAPID keys).'
        };
        setNotifError(reasonMap[out.reason] || 'No se pudo activar notificaciones push.');
        return;
      }
      setNotifSuccess('Notificaciones push activadas.');
    } catch {
      setNotifError('No se pudo activar notificaciones push.');
    } finally {
      setNotifSubscribing(false);
    }
  };

  return (
    <div className="grid settings-page" style={{ gap: 12 }}>
      <section className="card">
        <h2 className="screen-title" style={{ marginBottom: 0 }}>Settings</h2>
        <p className="muted">Tu espacio de cuenta: simple, claro y orientado a decisiones.</p>
      </section>

      <div className="card">
        <h2>Cuenta</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Elegí el modo visual que mejor te acompañe en el día a día.
        </p>
        <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start', gap: 8 }}>
          <button type="button" onClick={() => setTheme('dark')} style={{ borderColor: theme === 'dark' ? '#00E08E' : undefined }}>
            Oscuro
          </button>
          <button type="button" onClick={() => setTheme('light')} style={{ borderColor: theme === 'light' ? '#00E08E' : undefined }}>
            Claro
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Notificaciones</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Configurá alertas clave y ventanas de silencio en tu horario local ({userTimezone}).
        </p>

        {notifLoading ? (
          <p className="muted" style={{ marginTop: 8 }}>Cargando preferencias...</p>
        ) : (
          <>
            <div className="grid grid-2" style={{ marginTop: 10 }}>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={notif.stopLoss}
                  onChange={(e) => setNotif((p) => ({ ...p, stopLoss: e.target.checked }))}
                />
                <span className="muted">Stop loss / risk breach</span>
              </label>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={notif.opportunities}
                  onChange={(e) => setNotif((p) => ({ ...p, opportunities: e.target.checked }))}
                />
                <span className="muted">Oportunidades</span>
              </label>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={notif.regimeChanges}
                  onChange={(e) => setNotif((p) => ({ ...p, regimeChanges: e.target.checked }))}
                />
                <span className="muted">Cambios de régimen</span>
              </label>
              <div />
              <label className="label">
                <span className="muted">Silencio desde ({userTimezone})</span>
                <input
                  type="time"
                  value={notif.quietHoursStart}
                  onChange={(e) => setNotif((p) => ({ ...p, quietHoursStart: e.target.value }))}
                />
              </label>
              <label className="label">
                <span className="muted">Silencio hasta ({userTimezone})</span>
                <input
                  type="time"
                  value={notif.quietHoursEnd}
                  onChange={(e) => setNotif((p) => ({ ...p, quietHoursEnd: e.target.value }))}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={handleSaveNotif} disabled={notifSaving}>
                {notifSaving ? 'Guardando...' : 'Guardar preferencias'}
              </button>
              <button type="button" onClick={handleEnablePush} disabled={notifSubscribing}>
                {notifSubscribing ? 'Activando...' : 'Activar notificaciones push'}
              </button>
            </div>

            {notifError && <div className="card" style={{ borderColor: '#FF4757AA', marginTop: 10 }}>{notifError}</div>}
            {notifSuccess && <div className="card" style={{ borderColor: '#00E08E88', marginTop: 10 }}>{notifSuccess}</div>}
          </>
        )}
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
