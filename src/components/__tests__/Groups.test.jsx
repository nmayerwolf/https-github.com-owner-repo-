/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getGroups: vi.fn(),
    createGroup: vi.fn(),
    renameGroup: vi.fn(),
    joinGroup: vi.fn(),
    getGroup: vi.fn(),
    leaveGroup: vi.fn()
  }
}));

vi.mock('../../api/apiClient', () => ({
  api: apiMock
}));

import Groups from '../Groups';

afterEach(() => {
  cleanup();
});

describe('Groups', () => {
  beforeEach(() => {
    apiMock.getGroups.mockReset();
    apiMock.createGroup.mockReset();
    apiMock.renameGroup.mockReset();
    apiMock.joinGroup.mockReset();
    apiMock.getGroup.mockReset();
    apiMock.leaveGroup.mockReset();

    apiMock.getGroups.mockResolvedValue({ groups: [] });
  });

  it('maps GROUP_LIMIT_REACHED on create group', async () => {
    apiMock.createGroup.mockRejectedValueOnce({ error: 'GROUP_LIMIT_REACHED' });

    render(<Groups />);

    await screen.findByText('No estás en grupos todavía.');

    fireEvent.change(screen.getByPlaceholderText('Mi grupo de inversión'), { target: { value: 'Nuevo Grupo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('Llegaste al máximo de 5 grupos por usuario.')).toBeTruthy();
  });

  it('maps GROUP_MEMBER_LIMIT_REACHED on join group', async () => {
    apiMock.joinGroup.mockRejectedValueOnce({ error: 'GROUP_MEMBER_LIMIT_REACHED' });

    render(<Groups />);

    await screen.findByText('No estás en grupos todavía.');

    fireEvent.change(screen.getByPlaceholderText('NXF-A7K2M'), { target: { value: 'nxf-a7k2m' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirme' }));

    expect(await screen.findByText('Este grupo ya alcanzó su máximo de 20 miembros.')).toBeTruthy();
  });

  it('renames a group when user is admin', async () => {
    apiMock.getGroups.mockResolvedValue({
      groups: [{ id: 'g1', name: 'Grupo Viejo', code: 'NXF-A7K2M', role: 'admin', members: 2 }]
    });

    render(<Groups />);

    await screen.findByText('Grupo Viejo');

    fireEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(screen.getByPlaceholderText('Nuevo nombre del grupo'), { target: { value: 'Grupo Nuevo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(apiMock.renameGroup).toHaveBeenCalledWith('g1', 'Grupo Nuevo');
  });

  it('maps ADMIN_ONLY when rename is rejected by backend', async () => {
    apiMock.getGroups.mockResolvedValue({
      groups: [{ id: 'g1', name: 'Grupo', code: 'NXF-A7K2M', role: 'admin', members: 2 }]
    });
    apiMock.renameGroup.mockRejectedValueOnce({ error: 'ADMIN_ONLY' });

    render(<Groups />);

    await screen.findByText('Grupo');

    fireEvent.click(screen.getByRole('button', { name: 'Renombrar' }));
    fireEvent.change(screen.getByPlaceholderText('Nuevo nombre del grupo'), { target: { value: 'Otro Nombre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Solo admins pueden editar el nombre del grupo.')).toBeTruthy();
  });

  it('loads and renders group detail in read-only mode', async () => {
    apiMock.getGroups.mockResolvedValue({
      groups: [{ id: 'g1', name: 'Grupo 1', code: 'NXF-A7K2M', role: 'member', members: 2 }]
    });
    apiMock.getGroup.mockResolvedValue({
      id: 'g1',
      name: 'Grupo 1',
      code: 'NXF-A7K2M',
      role: 'member',
      members: [
        {
          userId: 'u1',
          displayName: 'nicolas',
          role: 'admin',
          positions: [{ symbol: 'AAPL', category: 'equity', quantity: 10, plPercent: null }]
        }
      ]
    });

    render(<Groups />);

    await screen.findByText('Grupo 1');

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));

    expect(apiMock.getGroup).toHaveBeenCalledWith('g1');
    expect(await screen.findByText('Detalle de grupo')).toBeTruthy();
    expect(await screen.findByText('nicolas')).toBeTruthy();
    expect(await screen.findByText('AAPL')).toBeTruthy();
    expect(await screen.findByText('Qty: 10')).toBeTruthy();
    expect(await screen.findByText('P&L: N/D')).toBeTruthy();
    expect(screen.queryByText(/buyPrice/i)).toBeNull();
  });
});
