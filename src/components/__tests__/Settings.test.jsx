/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';

const { apiMock, subscribeBrowserPushMock, themeCtxMock, authCtxMock } = vi.hoisted(() => ({
  apiMock: {
    getAgentProfile: vi.fn(),
    updateAgentProfile: vi.fn(),
    resetPassword: vi.fn(),
    getNotificationPreferences: vi.fn(),
    updateNotificationPreferences: vi.fn()
  },
  subscribeBrowserPushMock: vi.fn(),
  themeCtxMock: {
    theme: 'dark',
    setTheme: vi.fn()
  },
  authCtxMock: {
    user: { authProvider: 'email' },
    logout: vi.fn()
  }
}));

vi.mock('../../api/apiClient', () => ({ api: apiMock }));
vi.mock('../../lib/notifications', () => ({ subscribeBrowserPush: subscribeBrowserPushMock }));
vi.mock('../../store/ThemeContext', () => ({ useTheme: () => themeCtxMock }));
vi.mock('../../store/AuthContext', () => ({ useAuth: () => authCtxMock }));

import Settings from '../Settings';

afterEach(() => {
  cleanup();
});

describe('Settings', () => {
  const renderWithLanguage = (ui) => render(<LanguageProvider initialLanguage="en">{ui}</LanguageProvider>);

  beforeEach(() => {
    apiMock.getAgentProfile.mockReset();
    apiMock.updateAgentProfile.mockReset();
    apiMock.resetPassword.mockReset();
    apiMock.getNotificationPreferences.mockReset();
    apiMock.updateNotificationPreferences.mockReset();
    subscribeBrowserPushMock.mockReset();
    themeCtxMock.setTheme.mockReset();
    authCtxMock.logout.mockReset();

    apiMock.getAgentProfile.mockResolvedValue({ preset_type: 'balanced', risk_level: 0.5, horizon: 0.5, focus: 0.5, language: 'en' });
    apiMock.getNotificationPreferences.mockResolvedValue({
      stopLoss: true,
      opportunities: true,
      groupActivity: true,
      quietHoursStart: null,
      quietHoursEnd: null
    });
    apiMock.updateAgentProfile.mockResolvedValue({ ok: true });
  });

  it('switches theme to light', async () => {
    renderWithLanguage(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));

    expect(themeCtxMock.setTheme).toHaveBeenCalledWith('light');
  });

  it('saves agent profile', async () => {
    renderWithLanguage(<Settings />);

    await waitFor(() => expect(apiMock.getAgentProfile).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Strategic Core' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(apiMock.updateAgentProfile).toHaveBeenCalledTimes(1));
    expect(apiMock.updateAgentProfile.mock.calls[0][0].preset_type).toBe('strategic_core');
  });

  it('updates password successfully', async () => {
    apiMock.resetPassword.mockResolvedValueOnce({ ok: true });

    renderWithLanguage(<Settings />);

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'abc12345' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect(apiMock.resetPassword).toHaveBeenCalledWith('abc12345', 'newpass123');
    expect(await screen.findByText('Contraseña actualizada correctamente.')).toBeTruthy();
  });
});
