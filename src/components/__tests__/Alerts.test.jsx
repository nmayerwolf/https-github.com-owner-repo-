/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, appCtxMock } = vi.hoisted(() => ({
  apiMock: {
    getAlerts: vi.fn(),
    getGroups: vi.fn(),
    shareAlert: vi.fn(),
    exportAlertPdf: vi.fn()
  },
  appCtxMock: {
    state: {
      alerts: [
        { id: 'l1', type: 'compra', title: 'BUY AAPL', confidence: 'high', net: 4, symbol: 'AAPL' },
        { id: 'l2', type: 'venta', title: 'SELL TSLA', confidence: 'medium', net: -3, symbol: 'TSLA' }
      ],
      config: {}
    },
    actions: {
      getAssetBySymbol: vi.fn(() => null)
    }
  }
}));

vi.mock('../../api/apiClient', () => ({ api: apiMock }));
vi.mock('../../api/claude', () => ({ generateInvestmentThesis: vi.fn(), askClaude: vi.fn() }));
vi.mock('../../store/AppContext', () => ({ useApp: () => appCtxMock }));

import Alerts from '../Alerts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Alerts', () => {
  beforeEach(() => {
    apiMock.getAlerts.mockReset();
    apiMock.getGroups.mockReset();
    apiMock.shareAlert.mockReset();
    apiMock.exportAlertPdf.mockReset();

    apiMock.getAlerts.mockResolvedValue({
      alerts: [
        {
          id: 'h1',
          symbol: 'NVDA',
          recommendation: 'STRONG BUY',
          confidence: 'high',
          type: 'opportunity',
          outcome: 'win',
          priceAtAlert: 118.2,
          createdAt: '2026-02-10T14:30:00.000Z'
        }
      ],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
      stats: { total: 1, opportunities: 1, bearish: 0, stopLoss: 0, hitRate: 0.63, avgReturn: 8.2 }
    });

    apiMock.getGroups.mockResolvedValue({
      groups: [{ id: 'g1', name: 'Grupo Principal', code: 'NXF-A7K2M', role: 'admin', members: 2 }]
    });
    apiMock.shareAlert.mockResolvedValue({ shared: true });
    apiMock.exportAlertPdf.mockResolvedValue(new Uint8Array([37, 80, 68, 70]).buffer);

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:url'),
      revokeObjectURL: vi.fn()
    });

    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        const el = realCreateElement(tag);
        el.click = vi.fn();
        return el;
      }
      return realCreateElement(tag);
    });
  });

  it('shows live alerts by default and filters by type', async () => {
    render(<Alerts />);

    expect(screen.getByText('BUY AAPL')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'venta' }));

    expect(screen.getByText('SELL TSLA')).toBeTruthy();
  });

  it('loads history tab from backend', async () => {
    render(<Alerts />);

    fireEvent.click(screen.getByRole('button', { name: 'Historial' }));

    await waitFor(() => expect(apiMock.getAlerts).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/NVDA/)).toBeTruthy();
    expect(screen.getByText(/STRONG BUY/)).toBeTruthy();
  });

  it('shows performance metrics from backend stats', async () => {
    render(<Alerts />);

    fireEvent.click(screen.getByRole('button', { name: 'Rendimiento' }));

    await waitFor(() => expect(apiMock.getAlerts).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Tasa de acierto')).toBeTruthy();
    expect(screen.getByText('+63.00%')).toBeTruthy();
    expect(screen.getByText('+8.20%')).toBeTruthy();
  });

  it('shares an alert into selected group from history', async () => {
    render(<Alerts />);

    fireEvent.click(screen.getByRole('button', { name: 'Historial' }));

    await waitFor(() => expect(apiMock.getAlerts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apiMock.getGroups).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Grupo para compartir h1'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compartir señal' }));

    await waitFor(() => expect(apiMock.shareAlert).toHaveBeenCalledWith('h1', 'g1'));
    expect(await screen.findByText('Señal compartida en el grupo.')).toBeTruthy();
  });

  it('exports alert as pdf from history', async () => {
    render(<Alerts />);

    fireEvent.click(screen.getByRole('button', { name: 'Historial' }));

    await waitFor(() => expect(apiMock.getAlerts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));

    await waitFor(() => expect(apiMock.exportAlertPdf).toHaveBeenCalledWith('h1'));
    expect(await screen.findByText('PDF exportado correctamente.')).toBeTruthy();
  });
});
