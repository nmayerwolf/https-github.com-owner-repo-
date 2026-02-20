/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, appCtxMock, subscribeBrowserPushMock, themeCtxMock } = vi.hoisted(() => ({
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

  it('switches theme to light', async () => {
    render(<Settings />);

    fireEvent.click(screen.getByRole('button', { name: 'Claro' }));

    expect(themeCtxMock.setTheme).toHaveBeenCalledWith('light');
  });

  it('updates password successfully', async () => {
    apiMock.resetPassword.mockResolvedValueOnce({ ok: true });

    render(<Settings />);

    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'abc12345' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));

    expect(apiMock.resetPassword).toHaveBeenCalledWith('abc12345', 'newpass123');
    expect(await screen.findByText('Contraseña actualizada correctamente.')).toBeTruthy();
  });

  it('validates password confirmation before calling api', async () => {
    render(<Settings />);

    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'abc12345' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: 'different123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));

    expect(apiMock.resetPassword).not.toHaveBeenCalled();
    expect(await screen.findByText('La nueva contraseña y su confirmación no coinciden.')).toBeTruthy();
  });

  it('maps INVALID_CURRENT_PASSWORD from backend', async () => {
    apiMock.resetPassword.mockRejectedValueOnce({ error: 'INVALID_CURRENT_PASSWORD' });

    render(<Settings />);

    fireEvent.change(screen.getByLabelText('Contraseña actual'), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText('Nueva contraseña'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirmar nueva contraseña'), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar contraseña' }));

    expect(await screen.findByText('La contraseña actual es incorrecta.')).toBeTruthy();
  });

  it('saves notification preferences', async () => {
    apiMock.updateNotificationPreferences.mockResolvedValueOnce({
      stopLoss: false,
      opportunities: true,
      groupActivity: true,
      quietHoursStart: '23:00',
      quietHoursEnd: '08:00'
    });

    render(<Settings />);

    await waitFor(() => expect(apiMock.getNotificationPreferences).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByLabelText(/Stop loss/));
    fireEvent.change(screen.getByLabelText(/Silencio desde/), { target: { value: '23:00' } });
    fireEvent.change(screen.getByLabelText(/Silencio hasta/), { target: { value: '08:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar preferencias' }));

    await waitFor(() => expect(apiMock.updateNotificationPreferences).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Preferencias de notificación guardadas.')).toBeTruthy();
  });

  it('activates browser push from settings', async () => {
    subscribeBrowserPushMock.mockResolvedValueOnce({ ok: true });

    render(<Settings />);

    await waitFor(() => expect(apiMock.getNotificationPreferences).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Activar notificaciones push' }));

    await waitFor(() => expect(subscribeBrowserPushMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Notificaciones push activadas.')).toBeTruthy();
  });
});
