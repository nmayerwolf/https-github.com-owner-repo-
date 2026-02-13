/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, authMock } = vi.hoisted(() => ({
  apiMock: {
    getGroups: vi.fn(),
    getGroup: vi.fn(),
    createGroup: vi.fn(),
    joinGroup: vi.fn(),
    leaveGroup: vi.fn(),
    removeMember: vi.fn()
  },
  authMock: {
    user: { id: 'u-admin', email: 'admin@mail.com' }
  }
}));

vi.mock('../../api/apiClient', () => ({
  api: apiMock
}));

vi.mock('../../store/AuthContext', () => ({
  useAuth: () => authMock
}));

import Groups from '../Groups';

afterEach(() => {
  cleanup();
});

const baseGroup = { id: 'g1', name: 'Mi Grupo', code: 'NXF-A7K2M', role: 'admin', members: 2 };

const groupDetail = {
  id: 'g1',
  name: 'Mi Grupo',
  code: 'NXF-A7K2M',
  role: 'admin',
  members: [
    { userId: 'u-admin', displayName: 'admin', role: 'admin', positions: [{ symbol: 'AAPL', category: 'equity', quantity: 3 }] },
    { userId: 'u-member', displayName: 'ana', role: 'member', positions: [{ symbol: 'BTC', category: 'crypto', quantity: 0.5 }] }
  ]
};

describe('Groups', () => {
  beforeEach(() => {
    apiMock.getGroups.mockReset();
    apiMock.getGroup.mockReset();
    apiMock.createGroup.mockReset();
    apiMock.joinGroup.mockReset();
    apiMock.leaveGroup.mockReset();
    apiMock.removeMember.mockReset();

    apiMock.getGroups.mockResolvedValue({ groups: [baseGroup] });
    apiMock.getGroup.mockResolvedValue(groupDetail);
  });

  it('loads groups and opens group detail', async () => {
    render(<Groups />);

    expect(await screen.findByText('Mi Grupo')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));

    expect(await screen.findByText('Posiciones activas del grupo: 2')).toBeTruthy();
    expect(await screen.findByText('ana')).toBeTruthy();
  });

  it('allows admin to remove member from detail', async () => {
    render(<Groups />);

    await screen.findByText('Mi Grupo');
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));

    const removeBtn = await screen.findByRole('button', { name: 'Eliminar miembro' });
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(apiMock.removeMember).toHaveBeenCalledWith('g1', 'u-member');
    });
  });

  it('shows mapped backend error when join code is invalid', async () => {
    apiMock.joinGroup.mockRejectedValueOnce({ error: 'GROUP_NOT_FOUND' });

    render(<Groups />);

    await screen.findByText('Mi Grupo');

    fireEvent.change(screen.getByPlaceholderText('NXF-A7K2M'), { target: { value: 'bad-code' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirme' }));

    expect(await screen.findByText('El grupo no existe o ya no está disponible.')).toBeTruthy();
  });
});
