/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { authState } = vi.hoisted(() => ({
  authState: {
    loading: false,
    login: vi.fn(),
    register: vi.fn()
  }
}));

vi.mock('../../store/AuthContext', () => ({
  useAuth: () => authState
}));

import AuthScreen from '../AuthScreen';

afterEach(() => {
  cleanup();
});

describe('AuthScreen', () => {
  beforeEach(() => {
    authState.loading = false;
    authState.login.mockReset();
    authState.register.mockReset();
  });

  it('normalizes email and submits login', async () => {
    authState.login.mockResolvedValueOnce({});

    render(<AuthScreen />);

    fireEvent.change(screen.getByPlaceholderText('user@mail.com'), { target: { value: ' User@Mail.com ' } });
    fireEvent.change(screen.getByPlaceholderText('********'), { target: { value: 'abc12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(authState.login).toHaveBeenCalledWith('user@mail.com', 'abc12345');
    });
  });

  it('shows mismatch message on register', async () => {
    render(<AuthScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    fireEvent.change(screen.getByPlaceholderText('user@mail.com'), { target: { value: 'user@mail.com' } });
    fireEvent.change(screen.getAllByPlaceholderText('********')[0], { target: { value: 'abc12345' } });
    fireEvent.change(screen.getAllByPlaceholderText('********')[1], { target: { value: 'abc123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrarme' }));

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(authState.register).not.toHaveBeenCalled();
  });

  it('maps lockout retryAfter errors to readable text', async () => {
    authState.login.mockRejectedValueOnce({ status: 429, retryAfter: 900 });

    render(<AuthScreen />);

    fireEvent.change(screen.getByPlaceholderText('user@mail.com'), { target: { value: 'user@mail.com' } });
    fireEvent.change(screen.getByPlaceholderText('********'), { target: { value: 'abc12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Demasiados intentos. Esperá 15 minutos.')).toBeTruthy();
  });

  it('maps duplicate email error on register', async () => {
    authState.register.mockRejectedValueOnce({ status: 409, error: 'EMAIL_EXISTS' });

    render(<AuthScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    fireEvent.change(screen.getByPlaceholderText('user@mail.com'), { target: { value: 'user@mail.com' } });
    fireEvent.change(screen.getAllByPlaceholderText('********')[0], { target: { value: 'abc12345' } });
    fireEvent.change(screen.getAllByPlaceholderText('********')[1], { target: { value: 'abc12345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrarme' }));

    expect(await screen.findByText('Ya existe una cuenta con ese email.')).toBeTruthy();
  });
});
