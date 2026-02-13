/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getGroups: vi.fn(),
    createGroup: vi.fn(),
    renameGroup: vi.fn(),
    joinGroup: vi.fn(),
    getGroup: vi.fn(),
    getGroupFeed: vi.fn(),
    reactToGroupEvent: vi.fn(),
    deleteGroup: vi.fn(),
    removeMember: vi.fn(),
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
    apiMock.getGroupFeed.mockReset();
    apiMock.reactToGroupEvent.mockReset();
    apiMock.deleteGroup.mockReset();
    apiMock.removeMember.mockReset();
    apiMock.leaveGroup.mockReset();

    apiMock.getGroups.mockResolvedValue({ groups: [] });
    apiMock.getGroupFeed.mockResolvedValue({ events: [], pagination: { page: 1, limit: 20, total: 0 } });
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

  it('maps VALIDATION_ERROR message on join group', async () => {
    apiMock.joinGroup.mockRejectedValueOnce({ error: 'VALIDATION_ERROR', message: 'Código de invitación inválido' });

    render(<Groups />);

    await screen.findByText('No estás en grupos todavía.');

    fireEvent.change(screen.getByPlaceholderText('NXF-A7K2M'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unirme' }));

    expect(await screen.findByText('Código de invitación inválido')).toBeTruthy();
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

  it('allows admin to delete group', async () => {
    apiMock.getGroups.mockResolvedValue({
      groups: [{ id: 'g1', name: 'Grupo Admin', code: 'NXF-A7K2M', role: 'admin', members: 2 }]
    });

    render(<Groups />);

    await screen.findByText('Grupo Admin');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar grupo' }));

    expect(apiMock.deleteGroup).toHaveBeenCalledWith('g1');
  });

  it('maps ADMIN_ONLY when delete group is rejected by backend', async () => {
    apiMock.getGroups.mockResolvedValue({
      groups: [{ id: 'g1', name: 'Grupo Admin', code: 'NXF-A7K2M', role: 'admin', members: 2 }]
    });
    apiMock.deleteGroup.mockRejectedValueOnce({ error: 'ADMIN_ONLY' });

    render(<Groups />);

    await screen.findByText('Grupo Admin');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar grupo' }));

    expect(await screen.findByText('Solo admins pueden editar este grupo.')).toBeTruthy();
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

    expect(await screen.findByText('Solo admins pueden editar este grupo.')).toBeTruthy();
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
    expect(await screen.findByText('Miembros: 1')).toBeTruthy();
    expect(screen.queryByText(/buyPrice/i)).toBeNull();
  });

  it('allows admin to remove member from selected group', async () => {
    apiMock.getGroups.mockResolvedValue({
      groups: [{ id: 'g1', name: 'Grupo Admin', code: 'NXF-A7K2M', role: 'admin', members: 2 }]
    });

    apiMock.getGroup
      .mockResolvedValueOnce({
        id: 'g1',
        name: 'Grupo Admin',
        code: 'NXF-A7K2M',
        role: 'admin',
        members: [
          { userId: 'u-admin', displayName: 'owner', role: 'admin', positions: [] },
          { userId: 'u-member', displayName: 'amigo', role: 'member', positions: [] }
        ]
      })
      .mockResolvedValueOnce({
        id: 'g1',
        name: 'Grupo Admin',
        code: 'NXF-A7K2M',
        role: 'admin',
        members: [{ userId: 'u-admin', displayName: 'owner', role: 'admin', positions: [] }]
      });

    render(<Groups />);

    await screen.findByText('Grupo Admin');
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));

    expect(await screen.findByText('amigo')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Expulsar' }));

    expect(apiMock.removeMember).toHaveBeenCalledWith('g1', 'u-member');
  });

  it('maps CANNOT_REMOVE_ADMIN when backend rejects remove member', async () => {
    apiMock.getGroups.mockResolvedValue({
      groups: [{ id: 'g1', name: 'Grupo Admin', code: 'NXF-A7K2M', role: 'admin', members: 2 }]
    });

    apiMock.getGroup.mockResolvedValue({
      id: 'g1',
      name: 'Grupo Admin',
      code: 'NXF-A7K2M',
      role: 'admin',
      members: [{ userId: 'u-member', displayName: 'amigo', role: 'member', positions: [] }]
    });

    apiMock.removeMember.mockRejectedValueOnce({ error: 'CANNOT_REMOVE_ADMIN' });

    render(<Groups />);

    await screen.findByText('Grupo Admin');
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));

    expect(await screen.findByText('amigo')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Expulsar' }));

    expect(await screen.findByText('No podés expulsar a otro admin.')).toBeTruthy();
  });

  it('loads feed and sends reactions', async () => {
    apiMock.getGroups.mockResolvedValue({
      groups: [{ id: 'g1', name: 'Grupo Feed', code: 'NXF-A7K2M', role: 'member', members: 2 }]
    });
    apiMock.getGroup.mockResolvedValue({
      id: 'g1',
      name: 'Grupo Feed',
      code: 'NXF-A7K2M',
      role: 'member',
      members: []
    });
    apiMock.getGroupFeed.mockResolvedValue({
      events: [
        {
          id: 'e1',
          type: 'signal_shared',
          displayName: 'nicolas',
          data: { symbol: 'NVDA', recommendation: 'STRONG BUY' },
          reactions: { agree: 2, disagree: 0, userReaction: null },
          createdAt: '2026-02-13T12:00:00.000Z'
        }
      ],
      pagination: { page: 1, limit: 20, total: 1 }
    });

    render(<Groups />);

    await screen.findByText('Grupo Feed');
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Feed' }));

    expect(await screen.findByText(/compartió señal NVDA/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '👍 2' }));

    await waitFor(() => expect(apiMock.reactToGroupEvent).toHaveBeenCalledWith('g1', 'e1', 'agree'));
  });
});
