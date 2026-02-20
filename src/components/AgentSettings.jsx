import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/apiClient';
import { subscribeBrowserPush } from '../lib/notifications';
import { useTheme } from '../store/ThemeContext';
import { useAuth } from '../store/AuthContext';

const hasStrongPasswordShape = (value) => value.length >= 8 && /[a-zA-Z]/.test(value) && /[0-9]/.test(value);

const PRESETS = {
  strategic_core: { risk_level: 0.3, horizon: 0.7, focus: 0.2 },
  balanced: { risk_level: 0.5, horizon: 0.5, focus: 0.5 },
  opportunistic: { risk_level: 0.7, horizon: 0.3, focus: 0.8 }
};

const PRESET_COPY = {
  strategic_core: 'Focused on regime-aligned, high-conviction ideas. Fewer but stronger recommendations. Best for patient investors.',
  balanced: 'Mix of strategic and opportunistic ideas. Moderate risk filters. Best for most investors.',
  opportunistic: 'More short-term setups and tactical trades. Higher risk tolerance. Best for active investors.'
};

const AgentSettings = () => {
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const isGoogleAuth = String(user?.authProvider || '').toLowerCase() === 'google';

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const debounceRef = useRef(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const out = await api.getAgentProfile();
      setProfile(out || { preset_type: 'balanced', risk_level: 0.5, horizon: 0.5, focus: 0.5 });
    } catch {
      setError('Could not load data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadNotif = async () => {
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

    loadNotif();
    return () => {
      mounted = false;
    };
  }, []);

  const handlePreset = (preset) => {
    const defaults = PRESETS[preset] || PRESETS.balanced;
    setProfile((prev) => ({ ...(prev || {}), preset_type: preset, ...defaults }));
    setDirty(true);
  };

  const handleSlider = (field, value) => {
    const next = Number(value);
    setProfile((prev) => ({ ...(prev || {}), [field]: next }));
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty || !profile) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [profile, dirty]);

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await api.updateAgentProfile(profile);
      setDirty(false);
    } catch {
      setError('Could not save profile.');
    } finally {
      setSaving(false);
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
        setNotifError('No se pudo activar notificaciones push.');
        return;
      }
      setNotifSuccess('Notificaciones push activadas.');
    } catch {
      setNotifError('No se pudo activar notificaciones push.');
    } finally {
      setNotifSubscribing(false);
    }
  };

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
      } else {
        setPasswordError(err?.message || 'No se pudo actualizar la contraseña.');
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const presetType = String(profile?.preset_type || 'balanced');
  const presetDescription = PRESET_COPY[presetType] || PRESET_COPY.balanced;

  return (
    <div className="grid settings-page">
      <section className="card">
        <h2 className="screen-title">Your AI Agent</h2>
        <p className="muted">Customize how Horsai analyzes markets for you</p>
      </section>

      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <span className="muted">Loading...</span>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="error-state">
          <span className="muted">
            {error} <button type="button" onClick={load}>Retry</button>
          </span>
        </div>
      ) : null}

      {!loading && !error && profile ? (
        <>
          <section className="card">
            <h3 className="section-title">Strategy Preset</h3>
            <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className={`agent-preset-pill ${presetType === 'strategic_core' ? 'active' : ''}`} onClick={() => handlePreset('strategic_core')}>Strategic Core</button>
              <button type="button" className={`agent-preset-pill ${presetType === 'balanced' ? 'active' : ''}`} onClick={() => handlePreset('balanced')}>Balanced</button>
              <button type="button" className={`agent-preset-pill ${presetType === 'opportunistic' ? 'active' : ''}`} onClick={() => handlePreset('opportunistic')}>Opportunistic</button>
            </div>
          </section>

          <section className="card">
            <label className="label slider-label">
              <span>Risk Tolerance</span>
              <input type="range" min="0" max="1" step="0.01" value={Number(profile.risk_level || 0)} onChange={(e) => handleSlider('risk_level', e.target.value)} />
              <div className="slider-scale muted"><span>Conservative</span><span>Aggressive</span></div>
              <div className="mono muted">{Number(profile.risk_level || 0).toFixed(2)}</div>
            </label>

            <label className="label slider-label">
              <span>Investment Horizon</span>
              <input type="range" min="0" max="1" step="0.01" value={Number(profile.horizon || 0)} onChange={(e) => handleSlider('horizon', e.target.value)} />
              <div className="slider-scale muted"><span>Short-term</span><span>Long-term</span></div>
              <div className="mono muted">{Number(profile.horizon || 0).toFixed(2)}</div>
            </label>

            <label className="label slider-label">
              <span>Idea Focus</span>
              <input type="range" min="0" max="1" step="0.01" value={Number(profile.focus || 0)} onChange={(e) => handleSlider('focus', e.target.value)} />
              <div className="slider-scale muted"><span>Strategic</span><span>Opportunistic</span></div>
              <div className="mono muted">{Number(profile.focus || 0).toFixed(2)}</div>
            </label>

            <div className="card agent-preset-explainer">{presetDescription}</div>
            <button type="button" onClick={handleSave} disabled={!dirty || saving}>{saving ? 'Saving...' : 'Save'}</button>
          </section>
        </>
      ) : null}

      <section className="card">
        <h3 className="section-title">Account</h3>
        <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start', gap: 8 }}>
          <button type="button" onClick={() => setTheme('dark')} style={{ borderColor: theme === 'dark' ? '#00E08E' : undefined }}>Oscuro</button>
          <button type="button" onClick={() => setTheme('light')} style={{ borderColor: theme === 'light' ? '#00E08E' : undefined }}>Claro</button>
          <button type="button" onClick={logout}>Cerrar sesión</button>
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">Notificaciones</h3>
        {notifLoading ? <p className="muted">Loading...</p> : (
          <>
            <div className="grid grid-2" style={{ marginTop: 10 }}>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={notif.stopLoss} onChange={(e) => setNotif((p) => ({ ...p, stopLoss: e.target.checked }))} />
                <span className="muted">Stop loss</span>
              </label>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={notif.opportunities} onChange={(e) => setNotif((p) => ({ ...p, opportunities: e.target.checked }))} />
                <span className="muted">Oportunidades</span>
              </label>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={notif.groupActivity} onChange={(e) => setNotif((p) => ({ ...p, groupActivity: e.target.checked }))} />
                <span className="muted">Actividad de grupos</span>
              </label>
              <div />
              <label className="label">
                <span className="muted">Silencio desde (UTC)</span>
                <input type="time" value={notif.quietHoursStart} onChange={(e) => setNotif((p) => ({ ...p, quietHoursStart: e.target.value }))} />
              </label>
              <label className="label">
                <span className="muted">Silencio hasta (UTC)</span>
                <input type="time" value={notif.quietHoursEnd} onChange={(e) => setNotif((p) => ({ ...p, quietHoursEnd: e.target.value }))} />
              </label>
            </div>
            <div className="row" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
              <button type="button" onClick={handleSaveNotif} disabled={notifSaving}>{notifSaving ? 'Guardando...' : 'Guardar preferencias'}</button>
              <button type="button" onClick={handleEnablePush} disabled={notifSubscribing}>{notifSubscribing ? 'Activando...' : 'Activar notificaciones push'}</button>
            </div>
            {notifError ? <div className="card" style={{ borderColor: '#FF4757AA' }}>{notifError}</div> : null}
            {notifSuccess ? <div className="card" style={{ borderColor: '#00E08E88' }}>{notifSuccess}</div> : null}
          </>
        )}
      </section>

      {!isGoogleAuth ? (
        <section className="card">
          <h3 className="section-title">Seguridad</h3>
          <form onSubmit={handlePasswordSubmit} className="grid" style={{ marginTop: 10 }}>
            <label className="label">
              <span className="muted">Contraseña actual</span>
              <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="********" required />
            </label>
            <label className="label">
              <span className="muted">Nueva contraseña</span>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="********" required />
            </label>
            <label className="label">
              <span className="muted">Confirmar nueva contraseña</span>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="********" required />
            </label>
            {passwordError ? <div className="card" style={{ borderColor: '#FF4757AA' }}>{passwordError}</div> : null}
            {passwordSuccess ? <div className="card" style={{ borderColor: '#00E08E88' }}>{passwordSuccess}</div> : null}
            <button type="submit" disabled={passwordLoading}>{passwordLoading ? 'Actualizando...' : 'Actualizar contraseña'}</button>
          </form>
        </section>
      ) : null}
    </div>
  );
};

export default AgentSettings;
