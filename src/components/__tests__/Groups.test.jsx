/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getGroups: vi.fn(),
    createGroup: vi.fn(),
    joinGroup: vi.fn(),
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
    apiMock.joinGroup.mockReset();
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
});
