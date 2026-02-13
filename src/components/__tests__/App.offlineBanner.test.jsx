/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, appCtxMock, authCtxMock } = vi.hoisted(() => ({
  apiMock: {
    health: vi.fn(),
    migrate: vi.fn()
  },
  appCtxMock: {
    state: {
      loading: false,
      progress: { loaded: 0, total: 0 },
      sourceMode: 'remote',
      wsStatus: 'connected',
      uiErrors: [],
      apiHealth: {
        finnhub: { calls: 0, errors: 0, lastError: null },
        alphavantage: { calls: 0, errors: 0, lastError: null },
        claude: { calls: 0, errors: 0, lastError: null }
      }
    },
    actions: {
      dismissUiError: vi.fn()
    }
  },
  authCtxMock: {
    isAuthenticated: true,
    user: { email: 'user@mail.com' },
    logout: vi.fn()
  }
}));

vi.mock('../../api/apiClient', () => ({
  api: apiMock
}));

vi.mock('../../store/AppContext', () => ({
  useApp: () => appCtxMock
}));

vi.mock('../../store/AuthContext', () => ({
  useAuth: () => authCtxMock
}));

vi.mock('../Navigation', () => ({ default: () => <div>Navigation</div> }));
vi.mock('../Dashboard', () => ({ default: () => <div>Dashboard</div> }));
vi.mock('../Markets', () => ({ default: () => <div>Markets</div> }));
vi.mock('../Alerts', () => ({ default: () => <div>Alerts</div> }));
vi.mock('../Portfolio', () => ({ default: () => <div>Portfolio</div> }));
vi.mock('../Settings', () => ({ default: () => <div>Settings</div> }));
vi.mock('../Screener', () => ({ default: () => <div>Screener</div> }));
vi.mock('../Groups', () => ({ default: () => <div>Groups</div> }));
vi.mock('../AssetDetail', () => ({ default: () => <div>AssetDetail</div> }));
vi.mock('../AuthScreen', () => ({ default: () => <div>AuthScreen</div> }));
vi.mock('../common/LoadingScreen', () => ({ default: () => <div>Loading...</div> }));

import App from '../../App';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('App offline banner', () => {
  beforeEach(() => {
    apiMock.health.mockReset();
    apiMock.migrate.mockReset();
    authCtxMock.logout.mockReset();
    appCtxMock.actions.dismissUiError.mockReset();
  });

  it('shows offline banner when backend health check fails', async () => {
    apiMock.health.mockRejectedValueOnce(new Error('network down'));

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText('Modo offline')).toBeTruthy();
    expect(await screen.findByText(/No se pudo conectar con el backend/i)).toBeTruthy();
  });

  it('keeps offline banner hidden when backend health check succeeds', async () => {
    apiMock.health.mockResolvedValueOnce({ ok: true });

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(apiMock.health).toHaveBeenCalled();
    });

    expect(screen.queryByText('Modo offline')).toBeNull();
  });
});
