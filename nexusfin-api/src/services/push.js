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

const shouldNotifyForGroupActivity = (prefs) => {
  if (!prefs) return true;
  return prefs.group_activity !== false;
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

const isExpoPushToken = (value) => /^Expo(nent)?PushToken\[[^\]]+\]$/.test(String(value || ''));

const sendExpoNotification = async ({ to, title, body, data }) => {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  if (env.expoAccessToken) {
    headers.Authorization = `Bearer ${env.expoAccessToken}`;
  }

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      to,
      title,
      body,
      data,
      sound: 'default',
      priority: 'high'
    })
  });

  if (!res.ok) {
    throw new Error(`EXPO_PUSH_HTTP_${res.status}`);
  }

  return res.json();
};

const createPushNotifier = ({ query, logger = console }) => {
  const getPublicKey = () => env.vapidPublicKey || null;
  const webPushEnabled = hasVapidConfig();

  const sendToSubscriptions = async ({ subscriptions, title, body, data }) => {
    let sent = 0;
    let skippedWebConfig = false;
    const payload = JSON.stringify({ title, body, data });

    for (const sub of subscriptions) {
      if (sub.platform === 'web') {
        if (!webPushEnabled) {
          skippedWebConfig = true;
          continue;
        }

        try {
          await webpush.sendNotification(sub.subscription, payload);
          sent += 1;
        } catch (error) {
          const statusCode = Number(error?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            await query('UPDATE push_subscriptions SET active = false WHERE id = $1', [sub.id]);
          }
          logger.warn?.(`[push:web] failed for subscription ${sub.id}`, error?.message || error);
        }
      } else if (sub.platform === 'ios' || sub.platform === 'android') {
        const expoPushToken = String(sub.subscription?.expoPushToken || '').trim();
        if (!isExpoPushToken(expoPushToken)) {
          await query('UPDATE push_subscriptions SET active = false WHERE id = $1', [sub.id]);
          continue;
        }

        try {
          const out = await sendExpoNotification({ to: expoPushToken, title, body, data });
          const receipt = Array.isArray(out?.data) ? out.data[0] : out?.data;
          if (receipt?.status === 'ok') {
            sent += 1;
            continue;
          }

          const expoError = receipt?.details?.error || receipt?.message || 'EXPO_PUSH_ERROR';
          if (expoError === 'DeviceNotRegistered') {
            await query('UPDATE push_subscriptions SET active = false WHERE id = $1', [sub.id]);
          }
          logger.warn?.(`[push:expo] failed for subscription ${sub.id}`, expoError);
        } catch (error) {
          logger.warn?.(`[push:expo] failed for subscription ${sub.id}`, error?.message || error);
        }
      }
    }

    return { sent, skippedWebConfig };
  };

  const notifyAlert = async ({ userId, alert }) => {
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

    const { sent, skippedWebConfig } = await sendToSubscriptions({
      subscriptions: subOut.rows,
      title: buildPushTitle(alert),
      body: buildPushBody(alert),
      data: {
        type: alert.type,
        alertId: alert.id,
        symbol: alert.symbol
      }
    });

    if (sent === 0 && skippedWebConfig && !subOut.rows.some((s) => s.platform === 'ios' || s.platform === 'android')) {
      return { sent: 0, skipped: 'VAPID_NOT_CONFIGURED' };
    }

    return { sent };
  };

  const notifyGroupActivity = async ({ groupId, actorUserId, event }) => {
    if (!groupId || !event?.title || !event?.body) return { sent: 0, skipped: 'INVALID_PAYLOAD' };

    const members = await query('SELECT user_id FROM group_members WHERE group_id = $1 AND user_id <> $2', [groupId, actorUserId]);
    if (!members.rows.length) return { sent: 0, skipped: 'NO_MEMBERS' };

    let sent = 0;
    for (const member of members.rows) {
      const userId = member.user_id;

      const prefOut = await query(
        `SELECT group_activity, quiet_hours_start, quiet_hours_end
         FROM notification_preferences WHERE user_id = $1`,
        [userId]
      );
      const prefs = prefOut.rows[0] || null;

      if (!shouldNotifyForGroupActivity(prefs)) continue;
      if (prefs && isWithinQuietHours(prefs.quiet_hours_start, prefs.quiet_hours_end)) continue;

      const subOut = await query(
        `SELECT id, platform, subscription
         FROM push_subscriptions
         WHERE user_id = $1 AND active = true`,
        [userId]
      );
      if (!subOut.rows.length) continue;

      const out = await sendToSubscriptions({
        subscriptions: subOut.rows,
        title: String(event.title),
        body: String(event.body),
        data: {
          type: 'group_activity',
          groupId,
          eventType: event.type || 'group_event',
          ...(event.data || {})
        }
      });
      sent += Number(out.sent || 0);
    }

    return { sent };
  };

  return {
    getPublicKey,
    notifyAlert,
    notifyGroupActivity,
    hasVapidConfig: webPushEnabled
  };
};

module.exports = {
  createPushNotifier,
  isWithinQuietHours,
  shouldNotifyForAlertType,
  shouldNotifyForGroupActivity,
  buildPushTitle,
  buildPushBody,
  isExpoPushToken
};
