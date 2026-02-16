/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, appCtxMock, authCtxMock, subscribeBrowserPushMock } = vi.hoisted(() => ({
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
      config: {
        riskProfile: 'moderado',
        sectors: ['tech', 'crypto', 'metals'],
        horizon: 'mediano'
      },
      apiHealth: {
        finnhub: { calls: 0, errors: 0, lastError: null },
        alphavantage: { calls: 0, errors: 0, lastError: null },
        claude: { calls: 0, errors: 0, lastError: null }
      }
    },
    actions: {
      dismissUiError: vi.fn(),
      setConfig: vi.fn(async () => {})
    }
  },
  authCtxMock: {
    isAuthenticated: true,
    user: { email: 'user@mail.com', onboardingCompleted: false },
    logout: vi.fn(),
    completeOnboarding: vi.fn(async () => {})
  },
  subscribeBrowserPushMock: vi.fn()
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

vi.mock('../../lib/notifications', () => ({
  subscribeBrowserPush: subscribeBrowserPushMock
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

describe('App onboarding flow', () => {
  beforeEach(() => {
    apiMock.health.mockReset();
    apiMock.health.mockResolvedValue({ ok: true });
    apiMock.migrate.mockReset();
    authCtxMock.completeOnboarding.mockReset();
    appCtxMock.actions.setConfig.mockReset();
    subscribeBrowserPushMock.mockReset();
  });

  it('shows onboarding and completes profile setup', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>
    );

    expect(await screen.findByText('Bienvenido a Horsy')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar onboarding' }));

    await waitFor(() => {
      expect(appCtxMock.actions.setConfig).toHaveBeenCalled();
      expect(authCtxMock.completeOnboarding).toHaveBeenCalled();
    });
  });
});
