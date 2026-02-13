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
  buildPushTitle,
  buildPushBody
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

  test('build push title and body', () => {
    expect(buildPushTitle({ type: 'stop_loss', symbol: 'AAPL' })).toContain('STOP LOSS');
    expect(buildPushBody({ type: 'opportunity', recommendation: 'BUY', confidence: 'high', priceAtAlert: 123.45 })).toContain('BUY');
  });
});

describe('createPushNotifier', () => {
  test('returns skipped when VAPID is not configured', async () => {
    const query = jest.fn();
    const notifier = createPushNotifier({ query, logger: { warn: jest.fn() } });

    const result = await notifier.notifyAlert({
      userId: 'u1',
      alert: { id: 'a1', type: 'opportunity', symbol: 'AAPL', recommendation: 'BUY', confidence: 'high', priceAtAlert: 100 }
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe('VAPID_NOT_CONFIGURED');
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
});
