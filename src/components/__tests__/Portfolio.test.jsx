/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, appCtxMock } = vi.hoisted(() => ({
  apiMock: {
    getIdeas: vi.fn()
  },
  appCtxMock: {
    state: {
      assets: [{ symbol: 'AAPL', price: 120 }],
      portfolios: [{ id: 'pf-default', name: 'Portfolio principal', isDefault: true }],
      activePortfolioId: 'pf-default',
      positions: [
        {
          id: 'p1',
          portfolioId: 'pf-default',
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
      addPosition: vi.fn()
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
    apiMock.getIdeas.mockReset();
    apiMock.getIdeas.mockResolvedValue({ ideas: [] });
    appCtxMock.actions.addPosition.mockReset();
  });

  it('shows holdings and concentration without csv export controls', async () => {
    render(<Portfolio />);

    expect(await screen.findByText('Holdings')).toBeTruthy();
    expect(screen.getByText('AAPL · Apple')).toBeTruthy();
    expect(screen.getByText('Concentración')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).toBeNull();
  });
});
