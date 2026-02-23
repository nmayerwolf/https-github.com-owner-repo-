/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
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
vi.mock('../Agent', () => ({
  default: () => {
    throw new Error('agent exploded');
  }
}));
vi.mock('../Markets', () => ({ default: () => <div>Markets</div> }));
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

describe('App route error boundaries', () => {
  beforeEach(() => {
    apiMock.health.mockReset();
    apiMock.migrate.mockReset();
    authCtxMock.logout.mockReset();
    appCtxMock.actions.dismissUiError.mockReset();
  });

  it('renders fallback when agent module crashes', async () => {
    apiMock.health.mockResolvedValueOnce({ ok: true });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <MemoryRouter initialEntries={['/agent']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText('Error en Agent')).toBeTruthy();
    expect(await screen.findByText(/agent exploded/i)).toBeTruthy();
    errSpy.mockRestore();
  });
});
