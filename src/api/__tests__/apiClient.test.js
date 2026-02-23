import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, getToken, isAuthenticated, resetApiClientStateForTests, setAuthFailureHandler, setToken, setTokenUpdateHandler } from '../apiClient';

const makeResponse = ({ ok, status, body, refreshToken = null }) => ({
  ok,
  status,
  headers: {
    get: (name) => (name === 'X-Refresh-Token' ? refreshToken : null)
  },
  json: async () => body
});

describe('apiClient', () => {
  beforeEach(() => {
    resetApiClientStateForTests();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetApiClientStateForTests();
  });

  it('updates in-memory token from X-Refresh-Token header', async () => {
    setToken('old-token');

    global.fetch.mockResolvedValueOnce(makeResponse({ ok: true, status: 200, body: { ok: true }, refreshToken: 'new-token' }));

    const out = await api.health();

    expect(out).toEqual({ ok: true });
    expect(getToken()).toBe('new-token');
  });

  it('persists refreshed token via token update handler', async () => {
    const onTokenUpdate = vi.fn();
    setToken('old-token');
    setTokenUpdateHandler(onTokenUpdate);

    global.fetch.mockResolvedValueOnce(makeResponse({ ok: true, status: 200, body: { ok: true }, refreshToken: 'new-token' }));

    await api.health();

    expect(onTokenUpdate).toHaveBeenCalledWith('new-token');
  });

  it('clears token and triggers auth failure handler on TOKEN_EXPIRED', async () => {
    const onAuthFailure = vi.fn();
    setAuthFailureHandler(onAuthFailure);
    setToken('valid-token');

    global.fetch.mockResolvedValueOnce(
      makeResponse({
        ok: false,
        status: 401,
        body: { error: 'TOKEN_EXPIRED', message: 'Token inválido o expirado' }
      })
    );

    await expect(api.getPortfolio()).rejects.toMatchObject({ status: 401, error: 'TOKEN_EXPIRED' });
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
    expect(isAuthenticated()).toBe(false);
  });

  it('does not trigger auth failure handler for login invalid credentials', async () => {
    const onAuthFailure = vi.fn();
    setAuthFailureHandler(onAuthFailure);

    global.fetch.mockResolvedValueOnce(
      makeResponse({
        ok: false,
        status: 401,
        body: { error: 'INVALID_CREDENTIALS', message: 'Email o contraseña incorrectos' }
      })
    );

    await expect(api.login('user@mail.com', 'bad-pass')).rejects.toMatchObject({ status: 401, error: 'INVALID_CREDENTIALS' });
    expect(onAuthFailure).not.toHaveBeenCalled();
  });

  it('calls reset-password endpoint with expected payload', async () => {
    setToken('jwt-token');

    global.fetch.mockResolvedValueOnce(makeResponse({ ok: true, status: 200, body: { ok: true } }));

    const out = await api.resetPassword('old12345', 'newpass123');

    expect(out).toEqual({ ok: true });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/reset-password/authenticated',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' }),
        body: JSON.stringify({ currentPassword: 'old12345', newPassword: 'newpass123' })
      })
    );
  });

  it('calls forgot-password endpoint', async () => {
    global.fetch.mockResolvedValueOnce(makeResponse({ ok: true, status: 200, body: { message: 'ok' } }));
    const out = await api.forgotPassword('user@mail.com');
    expect(out).toEqual({ message: 'ok' });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/forgot-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@mail.com' })
      })
    );
  });

  it('calls logout endpoint with bearer token', async () => {
    setToken('jwt-token');

    global.fetch.mockResolvedValueOnce(makeResponse({ ok: true, status: 204, body: {} }));

    const out = await api.logout();

    expect(out).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/logout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' })
      })
    );
  });

  it('calls patch me endpoint', async () => {
    setToken('jwt-token');

    global.fetch.mockResolvedValueOnce(makeResponse({ ok: true, status: 200, body: { id: 'u1', onboardingCompleted: true } }));

    const out = await api.updateMe({ onboardingCompleted: true });

    expect(out.onboardingCompleted).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/me',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' }),
        body: JSON.stringify({ onboardingCompleted: true })
      })
    );
  });


  it('downloads alert pdf using export endpoint', async () => {
    setToken('jwt-token');
    const payload = new Uint8Array([37, 80, 68, 70]).buffer;

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => payload
    });

    const out = await api.exportAlertPdf('a1');

    expect(out).toBe(payload);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/api/export/alert/a1?format=pdf',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer jwt-token' }),
        credentials: 'include'
      })
    );
  });

});
