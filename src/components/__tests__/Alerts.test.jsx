/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, appCtxMock } = vi.hoisted(() => ({
  apiMock: {
    getAlerts: vi.fn()
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
vi.mock('../../api/claude', () => ({ generateInvestmentThesis: vi.fn() }));
vi.mock('../../store/AppContext', () => ({ useApp: () => appCtxMock }));

import Alerts from '../Alerts';

afterEach(() => {
  cleanup();
});

describe('Alerts', () => {
  beforeEach(() => {
    apiMock.getAlerts.mockReset();
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

    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));

    await waitFor(() => expect(apiMock.getAlerts).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Hit Rate')).toBeTruthy();
    expect(screen.getByText('+63.00%')).toBeTruthy();
    expect(screen.getByText('+8.20%')).toBeTruthy();
  });
});
