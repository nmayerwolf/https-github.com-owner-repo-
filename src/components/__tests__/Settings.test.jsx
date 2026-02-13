/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, appCtxMock } = vi.hoisted(() => ({
  apiMock: {
    resetPassword: vi.fn()
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
  }
}));

vi.mock('../../api/apiClient', () => ({
  api: apiMock
}));

vi.mock('../../store/AppContext', () => ({
  useApp: () => appCtxMock
}));

import Settings from '../Settings';

afterEach(() => {
  cleanup();
});

describe('Settings', () => {
  beforeEach(() => {
    apiMock.resetPassword.mockReset();
    appCtxMock.actions.setConfig.mockReset();
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
});
