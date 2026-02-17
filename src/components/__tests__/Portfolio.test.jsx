/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, appCtxMock } = vi.hoisted(() => ({
  apiMock: {
    exportPortfolioCsv: vi.fn(),
    getPortfolioAdvice: vi.fn(),
    refreshPortfolioAdvice: vi.fn()
  },
  appCtxMock: {
    state: {
      assets: [{ symbol: 'AAPL', price: 120 }],
      positions: [
        {
          id: 'p1',
          symbol: 'AAPL',
          name: 'Apple',
          category: 'equity',
          buyDate: '2026-01-10',
          buyPrice: 100,
          quantity: 1,
          sellDate: null,
          sellPrice: null
        }
      ]
    },
    actions: {
      addPosition: vi.fn(),
      sellPosition: vi.fn(),
      deletePosition: vi.fn()
    }
  }
}));

vi.mock('../../api/apiClient', () => ({
  api: apiMock
}));

vi.mock('../../store/AppContext', () => ({
  useApp: () => appCtxMock
}));

import Portfolio from '../Portfolio';

afterEach(() => {
  cleanup();
});

describe('Portfolio', () => {
  beforeEach(() => {
    apiMock.exportPortfolioCsv.mockReset();
    apiMock.getPortfolioAdvice.mockReset();
    apiMock.refreshPortfolioAdvice.mockReset();
    appCtxMock.actions.addPosition.mockReset();
    appCtxMock.actions.sellPosition.mockReset();
    appCtxMock.actions.deletePosition.mockReset();

    apiMock.exportPortfolioCsv.mockResolvedValue('Symbol,Name\nAAPL,Apple');
    apiMock.getPortfolioAdvice.mockResolvedValue({ advice: null, skipped: true, minimumPositions: 2 });
    apiMock.refreshPortfolioAdvice.mockResolvedValue({ advice: null, skipped: true, minimumPositions: 2 });

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:url'),
      revokeObjectURL: vi.fn()
    });

    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'a') {
        return {
          href: '',
          download: '',
          click: vi.fn()
        };
      }
      return realCreateElement(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('exports portfolio csv with selected filter', async () => {
    render(<Portfolio />);

    fireEvent.change(screen.getByLabelText('Filtro exportación'), { target: { value: 'sold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => expect(apiMock.exportPortfolioCsv).toHaveBeenCalledWith('sold'));
  });

  it('shows export error when api fails', async () => {
    apiMock.exportPortfolioCsv.mockRejectedValueOnce({ message: 'falló exportación' });

    render(<Portfolio />);

    fireEvent.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    expect(await screen.findByText('falló exportación')).toBeTruthy();
  });
});
