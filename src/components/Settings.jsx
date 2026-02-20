import React, { useEffect, useState } from 'react';
import { api } from '../api/apiClient';
import { subscribeBrowserPush } from '../lib/notifications';
import { useApp } from '../store/AppContext';
import { useLanguage } from '../store/LanguageContext';
import { useTheme } from '../store/ThemeContext';

const hasStrongPasswordShape = (value) => value.length >= 8 && /[a-zA-Z]/.test(value) && /[0-9]/.test(value);
const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
const CAPITAL_STYLE_KEY = 'horsai_capital_style_v1';
const CAPITAL_STYLE_OPTIONS = ['defensive', 'balanced', 'strategic_aggressive', 'opportunistic', 'alpha_hunter'];

const readInitialCapitalStyle = () => {
  try {
    const stored = String(window.localStorage.getItem(CAPITAL_STYLE_KEY) || '').trim().toLowerCase();
    if (CAPITAL_STYLE_OPTIONS.includes(stored)) return stored;
  } catch {
    // noop
  }
  return 'strategic_aggressive';
};

const saveCapitalStyle = (value) => {
  try {
    window.localStorage.setItem(CAPITAL_STYLE_KEY, value);
  } catch {
    // noop
  }
};

const Settings = () => {
  const { state, actions } = useApp();
  const { theme, setTheme } = useTheme();
  const { language, isSpanish, setLanguage } = useLanguage();
  const [capitalStyle, setCapitalStyle] = useState(readInitialCapitalStyle);
  const t = isSpanish
    ? {
        title: 'Configuración',
        subtitle: 'Tu espacio de cuenta: simple, claro y orientado a decisiones.',
        account: 'Cuenta',
        accountHelp: 'Elegí el modo visual que mejor te acompañe en el día a día.',
        dark: 'Oscuro',
        light: 'Claro',
        language: 'Idioma',
        languageHelp: 'Definí el idioma de toda la interfaz.',
        english: 'Inglés',
        spanish: 'Español',
        notifications: 'Notificaciones',
        notificationsHelp: 'Configurá alertas clave y ventanas de silencio en tu horario local',
        loadingPrefs: 'Cargando preferencias...',
        stopLoss: 'Límite de pérdida / ruptura de riesgo',
        opportunities: 'Oportunidades',
        regimeChanges: 'Cambios de régimen',
        quietStart: 'Silencio desde',
        quietEnd: 'Silencio hasta',
        savePrefs: 'Guardar preferencias',
        savingPrefs: 'Guardando...',
        enablePush: 'Activar notificaciones',
        enablingPush: 'Activando...',
        security: 'Seguridad',
        securityHelp: 'Cambiá tu contraseña de acceso.',
        currentPassword: 'Contraseña actual',
        newPassword: 'Nueva contraseña',
        confirmPassword: 'Confirmar nueva contraseña',
        updatePassword: 'Actualizar contraseña',
        updatingPassword: 'Actualizando...',
        errLoadNotif: 'No se pudieron cargar preferencias de notificaciones.',
        errPassMismatch: 'La nueva contraseña y su confirmación no coinciden.',
        errPassShape: 'La contraseña debe tener al menos 8 caracteres, 1 letra y 1 número.',
        okPassUpdated: 'Contraseña actualizada correctamente.',
        errCurrentPassword: 'La contraseña actual es incorrecta.',
        errPassWeak: 'La nueva contraseña no cumple los requisitos mínimos.',
        errPassUpdate: 'No se pudo actualizar la contraseña. Intentá nuevamente.',
        okPrefsSaved: 'Preferencias de notificación guardadas.',
        errPrefsSave: 'No se pudieron guardar las preferencias.',
        errPushUnsupported: 'Tu navegador no soporta notificaciones web.',
        errPushDenied: 'Permiso de notificaciones denegado.',
        errPushNoSw: 'No se pudo registrar el servicio de notificaciones.',
        errPushDisabled: 'Las notificaciones no están habilitadas en el servidor (faltan claves VAPID).',
        errPushEnable: 'No se pudieron activar las notificaciones.',
        okPushEnabled: 'Notificaciones activadas.',
        capitalStyle: 'Estilo de capital',
        capitalStyleHelp: 'Afecta solo ideas nuevas. Las ideas activas se revisan en su próxima fecha de revisión.',
        defensive: 'Defensivo',
        balanced: 'Balanceado',
        strategicAggressive: 'Agresivo estratégico',
        opportunistic: 'Oportunista',
        alphaHunter: 'Cazador de alfa'
      }
    : {
        title: 'Settings',
        subtitle: 'Your account space: simple, clear, and decision-oriented.',
        account: 'Account',
        accountHelp: 'Choose the visual mode that fits your daily workflow.',
        dark: 'Dark',
        light: 'Light',
        language: 'Language',
        languageHelp: 'Set the language for the whole interface.',
        english: 'English',
        spanish: 'Spanish',
        notifications: 'Notifications',
        notificationsHelp: 'Configure key alerts and quiet hours in your local timezone',
        loadingPrefs: 'Loading preferences...',
        stopLoss: 'Stop loss / risk breach',
        opportunities: 'Opportunities',
        regimeChanges: 'Regime changes',
        quietStart: 'Quiet hours from',
        quietEnd: 'Quiet hours until',
        savePrefs: 'Save preferences',
        savingPrefs: 'Saving...',
        enablePush: 'Enable push notifications',
        enablingPush: 'Enabling...',
        security: 'Security',
        securityHelp: 'Change your account password.',
        currentPassword: 'Current password',
        newPassword: 'New password',
        confirmPassword: 'Confirm new password',
        updatePassword: 'Update password',
        updatingPassword: 'Updating...',
        errLoadNotif: 'Could not load notification preferences.',
        errPassMismatch: 'New password and confirmation do not match.',
        errPassShape: 'Password must have at least 8 characters, 1 letter, and 1 number.',
        okPassUpdated: 'Password updated successfully.',
        errCurrentPassword: 'Current password is incorrect.',
        errPassWeak: 'New password does not meet minimum requirements.',
        errPassUpdate: 'Could not update password. Try again.',
        okPrefsSaved: 'Notification preferences saved.',
        errPrefsSave: 'Could not save preferences.',
        errPushUnsupported: 'Your browser does not support Web Push.',
        errPushDenied: 'Notifications permission denied.',
        errPushNoSw: 'Service worker registration failed.',
        errPushDisabled: 'Push is disabled on backend (missing VAPID keys).',
        errPushEnable: 'Could not enable push notifications.',
        okPushEnabled: 'Push notifications enabled.',
        capitalStyle: 'Capital style',
        capitalStyleHelp: 'Applies only to new ideas. Active ideas are updated at their next review date.',
        defensive: 'Defensive',
        balanced: 'Balanced',
        strategicAggressive: 'Strategic aggressive',
        opportunistic: 'Opportunistic',
        alphaHunter: 'Alpha hunter'
      };

  const capitalStyleLabels = {
    defensive: t.defensive,
    balanced: t.balanced,
    strategic_aggressive: t.strategicAggressive,
    opportunistic: t.opportunistic,
    alpha_hunter: t.alphaHunter
  };

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
        setNotifError(t.errLoadNotif);
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
      setPasswordError(t.errPassMismatch);
      return;
    }

    if (!hasStrongPasswordShape(newPassword)) {
      setPasswordError(t.errPassShape);
      return;
    }

    setPasswordLoading(true);
    try {
      await api.resetPassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(t.okPassUpdated);
    } catch (err) {
      if (err?.error === 'INVALID_CURRENT_PASSWORD') {
        setPasswordError(t.errCurrentPassword);
      } else if (err?.error === 'WEAK_PASSWORD') {
        setPasswordError(err?.message || t.errPassWeak);
      } else {
        setPasswordError(err?.message || t.errPassUpdate);
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
      setNotifSuccess(t.okPrefsSaved);
    } catch (err) {
      setNotifError(err?.message || t.errPrefsSave);
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
          UNSUPPORTED: t.errPushUnsupported,
          DENIED: t.errPushDenied,
          NO_REGISTRATION: t.errPushNoSw,
          PUSH_DISABLED: t.errPushDisabled
        };
        setNotifError(reasonMap[out.reason] || t.errPushEnable);
        return;
      }
      setNotifSuccess(t.okPushEnabled);
    } catch {
      setNotifError(t.errPushEnable);
    } finally {
      setNotifSubscribing(false);
    }
  };

  const handleCapitalStyle = async (nextStyle) => {
    const safe = CAPITAL_STYLE_OPTIONS.includes(nextStyle) ? nextStyle : 'strategic_aggressive';
    setCapitalStyle(safe);
    saveCapitalStyle(safe);
    if (typeof actions?.setConfig !== 'function') return;
    try {
      await actions.setConfig({
        ...(state?.config || {}),
        capitalStyle: safe
      });
    } catch {
      // keep local style even if remote update fails
    }
  };

  return (
    <div className="grid settings-page" style={{ gap: 12 }}>
      <section className="card">
        <h2 className="screen-title" style={{ marginBottom: 0 }}>{t.title}</h2>
        <p className="muted">{t.subtitle}</p>
      </section>

      <div className="card">
        <h2>{t.account}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {t.accountHelp}
        </p>
        <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start', gap: 8 }}>
          <button type="button" onClick={() => setTheme('dark')} style={{ borderColor: theme === 'dark' ? '#00E08E' : undefined }}>
            {t.dark}
          </button>
          <button type="button" onClick={() => setTheme('light')} style={{ borderColor: theme === 'light' ? '#00E08E' : undefined }}>
            {t.light}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>{t.language}</h2>
        <p className="muted" style={{ marginTop: 6 }}>{t.languageHelp}</p>
        <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start', gap: 8 }}>
          <button type="button" onClick={() => setLanguage('en')} style={{ borderColor: language === 'en' ? '#00E08E' : undefined }}>
            {t.english}
          </button>
          <button type="button" onClick={() => setLanguage('es')} style={{ borderColor: language === 'es' ? '#00E08E' : undefined }}>
            {t.spanish}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>{t.capitalStyle}</h2>
        <p className="muted" style={{ marginTop: 6 }}>{t.capitalStyleHelp}</p>
        <div className="row" style={{ marginTop: 8, justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
          {CAPITAL_STYLE_OPTIONS.map((styleKey) => (
            <button
              key={styleKey}
              type="button"
              onClick={() => handleCapitalStyle(styleKey)}
              style={{ borderColor: capitalStyle === styleKey ? '#00E08E' : undefined }}
            >
              {capitalStyleLabels[styleKey]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>{t.notifications}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {t.notificationsHelp} ({userTimezone}).
        </p>

        {notifLoading ? (
          <p className="muted" style={{ marginTop: 8 }}>{t.loadingPrefs}</p>
        ) : (
          <>
            <div className="grid grid-2" style={{ marginTop: 10 }}>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={notif.stopLoss}
                  onChange={(e) => setNotif((p) => ({ ...p, stopLoss: e.target.checked }))}
                />
                <span className="muted">{t.stopLoss}</span>
              </label>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={notif.opportunities}
                  onChange={(e) => setNotif((p) => ({ ...p, opportunities: e.target.checked }))}
                />
                <span className="muted">{t.opportunities}</span>
              </label>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={notif.regimeChanges}
                  onChange={(e) => setNotif((p) => ({ ...p, regimeChanges: e.target.checked }))}
                />
                <span className="muted">{t.regimeChanges}</span>
              </label>
              <div />
              <label className="label">
                <span className="muted">{t.quietStart} ({userTimezone})</span>
                <input
                  type="time"
                  value={notif.quietHoursStart}
                  onChange={(e) => setNotif((p) => ({ ...p, quietHoursStart: e.target.value }))}
                />
              </label>
              <label className="label">
                <span className="muted">{t.quietEnd} ({userTimezone})</span>
                <input
                  type="time"
                  value={notif.quietHoursEnd}
                  onChange={(e) => setNotif((p) => ({ ...p, quietHoursEnd: e.target.value }))}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={handleSaveNotif} disabled={notifSaving}>
                {notifSaving ? t.savingPrefs : t.savePrefs}
              </button>
              <button type="button" onClick={handleEnablePush} disabled={notifSubscribing}>
                {notifSubscribing ? t.enablingPush : t.enablePush}
              </button>
            </div>

            {notifError && <div className="card" style={{ borderColor: '#FF4757AA', marginTop: 10 }}>{notifError}</div>}
            {notifSuccess && <div className="card" style={{ borderColor: '#00E08E88', marginTop: 10 }}>{notifSuccess}</div>}
          </>
        )}
      </div>

      <div className="card">
        <h2>{t.security}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {t.securityHelp}
        </p>

        <form onSubmit={handlePasswordSubmit} className="grid" style={{ marginTop: 10 }}>
          <label className="label">
            <span className="muted">{t.currentPassword}</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="********"
              required
            />
          </label>

          <label className="label">
            <span className="muted">{t.newPassword}</span>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="********"
              required
            />
          </label>

          <label className="label">
            <span className="muted">{t.confirmPassword}</span>
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
            {passwordLoading ? t.updatingPassword : t.updatePassword}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Settings;
