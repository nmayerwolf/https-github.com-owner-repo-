import React, { useEffect, useState } from 'react';
import { api } from '../api/apiClient';
import { subscribeBrowserPush } from '../lib/notifications';
import { getNewsCtrSummary, resetNewsCtrStats } from '../store/newsAnalyticsStore';
import { useTheme } from '../store/ThemeContext';

const hasStrongPasswordShape = (value) => value.length >= 8 && /[a-zA-Z]/.test(value) && /[0-9]/.test(value);

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
    groupActivity: true,
    quietHoursStart: '',
    quietHoursEnd: ''
  });
  const [newsCtr, setNewsCtr] = useState(() => getNewsCtrSummary({ days: 7 }));
  const [newsCtrSource, setNewsCtrSource] = useState('local');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const prefs = await api.getNotificationPreferences();
        if (!mounted) return;
        setNotif({
          stopLoss: prefs.stopLoss ?? true,
          opportunities: prefs.opportunities ?? true,
          groupActivity: prefs.groupActivity ?? true,
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

  useEffect(() => {
    let mounted = true;
    const loadCtr = async () => {
      try {
        const out = await api.getNewsTelemetrySummary(7);
        if (!mounted) return;
        setNewsCtr({
          impressions: Number(out?.impressions || 0),
          clicks: Number(out?.clicks || 0),
          ctr: Number(out?.ctr || 0),
          byTheme: Array.isArray(out?.byTheme) ? out.byTheme : []
        });
        setNewsCtrSource('backend');
      } catch {
        if (!mounted) return;
        setNewsCtr(getNewsCtrSummary({ days: 7 }));
        setNewsCtrSource('local');
      }
    };
    loadCtr();
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
        groupActivity: notif.groupActivity,
        quietHoursStart: notif.quietHoursStart || null,
        quietHoursEnd: notif.quietHoursEnd || null
      });

      setNotif({
        stopLoss: updated.stopLoss,
        opportunities: updated.opportunities,
        groupActivity: updated.groupActivity,
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
        <h2 className="screen-title" style={{ marginBottom: 0 }}>Ajustes</h2>
        <p className="muted">Preferencias de notificaciones, cuenta y seguridad.</p>
      </section>

      <div className="card">
        <h2>Cuenta</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          Ajustes de visualización y sesión.
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
          Configurá alertas push y franjas de silencio (UTC).
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
                <span className="muted">Stop loss</span>
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
                  checked={notif.groupActivity}
                  onChange={(e) => setNotif((p) => ({ ...p, groupActivity: e.target.checked }))}
                />
                <span className="muted">Actividad de grupos</span>
              </label>
              <div />
              <label className="label">
                <span className="muted">Silencio desde (UTC)</span>
                <input
                  type="time"
                  value={notif.quietHoursStart}
                  onChange={(e) => setNotif((p) => ({ ...p, quietHoursStart: e.target.value }))}
                />
              </label>
              <label className="label">
                <span className="muted">Silencio hasta (UTC)</span>
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
        <h2>Insights de noticias IA</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          CTR de noticias recomendadas por IA (últimos 7 días). Fuente: {newsCtrSource === 'backend' ? 'backend' : 'local'}.
        </p>
        <div className="grid grid-2" style={{ marginTop: 10 }}>
          <div className="card">
            <div className="muted">Impresiones</div>
            <div className="ind-val mono perf-val">{Number(newsCtr.impressions || 0)}</div>
          </div>
          <div className="card">
            <div className="muted">Clicks</div>
            <div className="ind-val mono perf-val">{Number(newsCtr.clicks || 0)}</div>
          </div>
          <div className="card">
            <div className="muted">CTR total</div>
            <div className="ind-val mono perf-val">{Number(newsCtr.ctr || 0).toFixed(2)}%</div>
          </div>
          <div className="card">
            <div className="muted">Temas medidos</div>
            <div className="ind-val mono perf-val">{Array.isArray(newsCtr.byTheme) ? newsCtr.byTheme.length : 0}</div>
          </div>
        </div>
        <div className="grid" style={{ marginTop: 10 }}>
          {(newsCtr.byTheme || []).slice(0, 5).map((row) => (
            <div key={row.theme} className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
              <span className="muted">{String(row.theme || 'global')}</span>
              <span className="mono muted">
                imp {Number(row.impressions || 0)} · click {Number(row.clicks || 0)} · ctr {Number(row.ctr || 0).toFixed(2)}%
              </span>
            </div>
          ))}
          {!(newsCtr.byTheme || []).length ? <div className="muted">Todavía no hay interacciones suficientes.</div> : null}
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={async () => {
              try {
                await api.resetNewsTelemetry();
              } catch {
                // noop
              }
              resetNewsCtrStats();
              try {
                const out = await api.getNewsTelemetrySummary(7);
                setNewsCtr({
                  impressions: Number(out?.impressions || 0),
                  clicks: Number(out?.clicks || 0),
                  ctr: Number(out?.ctr || 0),
                  byTheme: Array.isArray(out?.byTheme) ? out.byTheme : []
                });
                setNewsCtrSource('backend');
              } catch {
                setNewsCtr(getNewsCtrSummary({ days: 7 }));
                setNewsCtrSource('local');
              }
            }}
          >
            Resetear métricas de noticias
          </button>
        </div>
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
