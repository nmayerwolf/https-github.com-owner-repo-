process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn()
}));

const webpush = require('web-push');
const {
  createPushNotifier,
  isWithinQuietHours,
  shouldNotifyForAlertType,
  shouldNotifyForGroupActivity,
  buildPushTitle,
  buildPushBody,
  isExpoPushToken
} = require('../src/services/push');

describe('push service helpers', () => {
  test('quiet hours handles same-day and overnight windows', () => {
    const now = new Date('2026-02-13T23:30:00Z');

    expect(isWithinQuietHours('22:00', '08:00', now)).toBe(true);
    expect(isWithinQuietHours('10:00', '12:00', now)).toBe(false);
  });

  test('shouldNotifyForAlertType respects preferences', () => {
    expect(shouldNotifyForAlertType({ stop_loss: false, opportunities: true }, 'stop_loss')).toBe(false);
    expect(shouldNotifyForAlertType({ stop_loss: true, opportunities: false }, 'opportunity')).toBe(false);
    expect(shouldNotifyForAlertType({ stop_loss: true, opportunities: true }, 'bearish')).toBe(true);
  });

  test('shouldNotifyForGroupActivity respects preferences', () => {
    expect(shouldNotifyForGroupActivity({ group_activity: false })).toBe(false);
    expect(shouldNotifyForGroupActivity({ group_activity: true })).toBe(true);
    expect(shouldNotifyForGroupActivity(null)).toBe(true);
  });

  test('build push title and body', () => {
    expect(buildPushTitle({ type: 'stop_loss', symbol: 'AAPL' })).toContain('STOP LOSS');
    expect(buildPushBody({ type: 'opportunity', recommendation: 'BUY', confidence: 'high', priceAtAlert: 123.45 })).toContain('BUY');
  });

  test('validates expo push token format', () => {
    expect(isExpoPushToken('ExpoPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('invalid')).toBe(false);
  });
});

describe('createPushNotifier', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('returns skipped when VAPID is not configured', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'sub-web', platform: 'web', subscription: { endpoint: 'https://example.com' } }]
      });
    const notifier = createPushNotifier({ query, logger: { warn: jest.fn() } });

    const result = await notifier.notifyAlert({
      userId: 'u1',
      alert: { id: 'a1', type: 'opportunity', symbol: 'AAPL', recommendation: 'BUY', confidence: 'high', priceAtAlert: 100 }
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe('VAPID_NOT_CONFIGURED');
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  test('sends expo push for mobile subscriptions without vapid', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'sub1', platform: 'ios', subscription: { expoPushToken: 'ExpoPushToken[token123]' } }]
      });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }] })
    });

    const notifier = createPushNotifier({ query, logger: { warn: jest.fn() } });
    const result = await notifier.notifyAlert({
      userId: 'u1',
      alert: { id: 'a1', type: 'opportunity', symbol: 'AAPL', recommendation: 'BUY', confidence: 'high', priceAtAlert: 100 }
    });

    expect(result.sent).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({ method: 'POST' })
    );
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  test('deactivates invalid expo token subscription', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'sub1', platform: 'android', subscription: { expoPushToken: 'bad-token' } }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const notifier = createPushNotifier({ query, logger: { warn: jest.fn() } });
    const result = await notifier.notifyAlert({
      userId: 'u1',
      alert: { id: 'a1', type: 'opportunity', symbol: 'AAPL', recommendation: 'BUY', confidence: 'high', priceAtAlert: 100 }
    });

    expect(result.sent).toBe(0);
    expect(query).toHaveBeenLastCalledWith('UPDATE push_subscriptions SET active = false WHERE id = $1', ['sub1']);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('sends system test notification to mobile subscription', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{ id: 'sub1', platform: 'ios', subscription: { expoPushToken: 'ExpoPushToken[token123]' } }]
      });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }] })
    });

    const notifier = createPushNotifier({ query, logger: { warn: jest.fn() } });
    const result = await notifier.notifySystem({
      userId: 'u1',
      title: 'Horsai test',
      body: 'Push de prueba'
    });

    expect(result.sent).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('skips system test notification during quiet hours when enabled', async () => {
    const query = jest.fn().mockResolvedValueOnce({
      rows: [{ quiet_hours_start: '00:00', quiet_hours_end: '00:00' }]
    });

    const notifier = createPushNotifier({ query, logger: { warn: jest.fn() } });
    const result = await notifier.notifySystem({
      userId: 'u1',
      title: 'Horsai test',
      body: 'Push de prueba',
      respectQuietHours: true
    });

    expect(result).toEqual({ sent: 0, skipped: 'QUIET_HOURS' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('notifies group activity to members respecting groupActivity preference', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ user_id: 'u2' }] })
      .mockResolvedValueOnce({ rows: [{ group_activity: true, quiet_hours_start: null, quiet_hours_end: null }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'sub1', platform: 'ios', subscription: { expoPushToken: 'ExpoPushToken[token123]' } }]
      });

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }] })
    });

    const notifier = createPushNotifier({ query, logger: { warn: jest.fn() } });
    const result = await notifier.notifyGroupActivity({
      groupId: 'g1',
      actorUserId: 'u1',
      event: {
        type: 'signal_shared',
        title: 'Nueva señal en grupo: NVDA',
        body: 'STRONG BUY compartida por un miembro',
        data: { alertId: 'a1', symbol: 'NVDA' }
      }
    });

    expect(result.sent).toBe(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://exp.host/--/api/v2/push/send',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('skips group activity notifications when preference disabled', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ user_id: 'u2' }] })
      .mockResolvedValueOnce({ rows: [{ group_activity: false, quiet_hours_start: null, quiet_hours_end: null }] });

    const notifier = createPushNotifier({ query, logger: { warn: jest.fn() } });
    const result = await notifier.notifyGroupActivity({
      groupId: 'g1',
      actorUserId: 'u1',
      event: {
        type: 'signal_shared',
        title: 'Nueva señal en grupo: NVDA',
        body: 'STRONG BUY compartida por un miembro',
        data: { alertId: 'a1', symbol: 'NVDA' }
      }
    });

    expect(result.sent).toBe(0);
    expect(query).toHaveBeenCalledTimes(2);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
