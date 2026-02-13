const webpush = require('web-push');
const { env } = require('../config/env');

const hasVapidConfig = () => Boolean(env.vapidPublicKey && env.vapidPrivateKey && env.vapidSubject);

if (hasVapidConfig()) {
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
}

const parseTime = (hhmm) => {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const [hh, mm] = hhmm.split(':').map((n) => Number(n));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
};

const isWithinQuietHours = (start, end, now = new Date()) => {
  const startMin = parseTime(start);
  const endMin = parseTime(end);
  if (startMin == null || endMin == null) return false;

  const current = now.getUTCHours() * 60 + now.getUTCMinutes();

  if (startMin === endMin) return true;
  if (startMin < endMin) return current >= startMin && current < endMin;
  return current >= startMin || current < endMin;
};

const shouldNotifyForAlertType = (prefs, alertType) => {
  if (!prefs) return true;
  if (alertType === 'stop_loss') return prefs.stop_loss !== false;
  if (alertType === 'opportunity') return prefs.opportunities !== false;
  if (alertType === 'bearish') return prefs.opportunities !== false;
  return true;
};

const buildPushTitle = (alert) => {
  if (alert.type === 'stop_loss') return `STOP LOSS: ${alert.symbol}`;
  if (alert.type === 'opportunity') return `${alert.recommendation}: ${alert.symbol}`;
  if (alert.type === 'bearish') return `${alert.recommendation}: ${alert.symbol}`;
  return `Nueva alerta: ${alert.symbol}`;
};

const buildPushBody = (alert) => {
  if (alert.type === 'stop_loss') {
    return `Precio ${Number(alert.priceAtAlert || 0).toFixed(2)} | SL ${Number(alert.stopLoss || 0).toFixed(2)}`;
  }
  return `${alert.recommendation} | Confianza ${alert.confidence || 'n/a'} | Precio ${Number(alert.priceAtAlert || 0).toFixed(2)}`;
};

const createPushNotifier = ({ query, logger = console }) => {
  const getPublicKey = () => env.vapidPublicKey || null;

  const notifyAlert = async ({ userId, alert }) => {
    if (!hasVapidConfig()) return { sent: 0, skipped: 'VAPID_NOT_CONFIGURED' };

    const prefOut = await query(
      `SELECT stop_loss, opportunities, quiet_hours_start, quiet_hours_end
       FROM notification_preferences WHERE user_id = $1`,
      [userId]
    );

    const prefs = prefOut.rows[0] || null;

    if (!shouldNotifyForAlertType(prefs, alert.type)) {
      return { sent: 0, skipped: 'PREFERENCES_DISABLED' };
    }

    if (prefs && isWithinQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end)) {
      return { sent: 0, skipped: 'QUIET_HOURS' };
    }

    const subOut = await query(
      `SELECT id, platform, subscription
       FROM push_subscriptions
       WHERE user_id = $1 AND active = true`,
      [userId]
    );

    if (!subOut.rows.length) {
      return { sent: 0, skipped: 'NO_SUBSCRIPTIONS' };
    }

    const payload = JSON.stringify({
      title: buildPushTitle(alert),
      body: buildPushBody(alert),
      data: {
        type: alert.type,
        alertId: alert.id,
        symbol: alert.symbol
      }
    });

    let sent = 0;

    for (const sub of subOut.rows) {
      if (sub.platform !== 'web') continue;

      try {
        await webpush.sendNotification(sub.subscription, payload);
        sent += 1;
      } catch (error) {
        const statusCode = Number(error?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await query('UPDATE push_subscriptions SET active = false WHERE id = $1', [sub.id]);
        }
        logger.warn?.(`[push] failed for subscription ${sub.id}`, error?.message || error);
      }
    }

    return { sent };
  };

  return {
    getPublicKey,
    notifyAlert,
    hasVapidConfig: hasVapidConfig()
  };
};

module.exports = {
  createPushNotifier,
  isWithinQuietHours,
  shouldNotifyForAlertType,
  buildPushTitle,
  buildPushBody
};
