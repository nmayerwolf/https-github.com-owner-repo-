/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, appCtxMock, subscribeBrowserPushMock, themeCtxMock, languageCtxMock } = vi.hoisted(() => ({
  apiMock: {
    resetPassword: vi.fn(),
    getNotificationPreferences: vi.fn(),
    updateNotificationPreferences: vi.fn(),
    getNewsTelemetrySummary: vi.fn(),
    resetNewsTelemetry: vi.fn()
  },
  appCtxMock: {
    state: {
      config: {
        riskProfile: 'moderado',
        horizon: 'mediano',
        rsiOS: 30,
        rsiOB: 70,
        volThresh: 2,
        minConfluence: 2
      }
    },
    actions: {
      setConfig: vi.fn()
    }
  },
  subscribeBrowserPushMock: vi.fn(),
  themeCtxMock: {
    theme: 'dark',
    setTheme: vi.fn()
  },
  languageCtxMock: {
    language: 'es',
    isSpanish: true,
    setLanguage: vi.fn()
  }
}));

vi.mock('../../api/apiClient', () => ({
  api: apiMock
}));

vi.mock('../../lib/notifications', () => ({
  subscribeBrowserPush: subscribeBrowserPushMock
}));

vi.mock('../../store/AppContext', () => ({
  useApp: () => appCtxMock
}));

vi.mock('../../store/ThemeContext', () => ({
  useTheme: () => themeCtxMock
}));

vi.mock('../../store/LanguageContext', () => ({
  useLanguage: () => languageCtxMock
}));

import Settings from '../Settings';

afterEach(() => {
  cleanup();
});

describe('Settings', () => {
  beforeEach(() => {
    apiMock.resetPassword.mockReset();
    apiMock.getNotificationPreferences.mockReset();
    apiMock.updateNotificationPreferences.mockReset();
    apiMock.getNewsTelemetrySummary.mockReset();
    apiMock.resetNewsTelemetry.mockReset();
    appCtxMock.actions.setConfig.mockReset();
    subscribeBrowserPushMock.mockReset();
    themeCtxMock.setTheme.mockReset();
    languageCtxMock.setLanguage.mockReset();

    apiMock.getNotificationPreferences.mockResolvedValue({
      stopLoss: true,
      opportunities: true,
      groupActivity: true,
      quietHoursStart: null,
      quietHoursEnd: null
    });
    apiMock.getNewsTelemetrySummary.mockResolvedValue({
      impressions: 0,
      clicks: 0,
      ctr: 0,
      byTheme: []
    });
    apiMock.resetNewsTelemetry.mockResolvedValue({ ok: true });
  });

  it('hides Account, Notifications and Security sections', async () => {
    render(<Settings />);

    expect(screen.queryByRole('heading', { name: 'Cuenta' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Notificaciones' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Seguridad' })).toBeNull();
  });

  it('switches language to English', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Inglés' }));
    expect(languageCtxMock.setLanguage).toHaveBeenCalledWith('en');
  });

  it('updates capital style in config', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Defensivo' }));
    expect(appCtxMock.actions.setConfig).toHaveBeenCalled();
    expect(appCtxMock.actions.setConfig.mock.calls[0][0]).toMatchObject({
      capitalStyle: 'defensive'
    });
  });
});
