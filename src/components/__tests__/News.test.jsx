/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, appCtxMock } = vi.hoisted(() => ({
  apiMock: {
    marketNews: vi.fn(),
    marketNewsRecommended: vi.fn()
  },
  appCtxMock: {
    state: {
      watchlistSymbols: ['AAPL'],
      assets: [{ symbol: 'AAPL', name: 'Apple Inc.' }]
    }
  }
}));

vi.mock('../../api/apiClient', () => ({ api: apiMock }));
vi.mock('../../store/AppContext', () => ({ useApp: () => appCtxMock }));

import News from '../News';

const nowSec = Math.floor(Date.now() / 1000);

const baseItems = [
  {
    id: 'n1',
    headline: 'Fed signals inflation risk for global markets',
    summary: 'Macro outlook shifts after central bank guidance.',
    source: 'Reuters',
    related: 'AAPL,MSFT',
    datetime: nowSec - 60,
    url: 'https://example.com/n1'
  },
  {
    id: 'n2',
    headline: 'Minor local event with low financial impact',
    summary: 'No material change for markets.',
    source: 'Blog',
    related: '',
    datetime: nowSec - 120,
    url: 'https://example.com/n2'
  },
  {
    id: 'n3',
    headline: 'OPEC updates oil supply expectations',
    summary: 'Energy markets react to new production targets.',
    source: 'Bloomberg',
    related: 'XOM,CVX',
    datetime: nowSec - 30,
    url: 'https://example.com/n3'
  }
];

describe('News', () => {
  beforeEach(() => {
    apiMock.marketNewsRecommended.mockReset();
    apiMock.marketNews.mockReset();
    apiMock.marketNewsRecommended.mockResolvedValue({
      items: [
        { ...baseItems[0], aiScore: 12, aiReasons: ['high:inflation', 'watchlist:AAPL', 'fresh:1h'] },
        { ...baseItems[2], aiScore: 10, aiReasons: ['high:opec', 'fresh:1h'] }
      ]
    });
    apiMock.marketNews.mockResolvedValueOnce(baseItems).mockResolvedValueOnce([]);
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows AI recommended mode by default and can switch to all', async () => {
    render(<News />);

    await waitFor(() => expect(apiMock.marketNewsRecommended).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Recomendadas por IA' })).toBeTruthy();
    expect(screen.getByText('Fed signals inflation risk for global markets')).toBeTruthy();
    expect(screen.getByText(/IA: Impacto alto: inflation/i)).toBeTruthy();
    expect(screen.queryByText('Minor local event with low financial impact')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    await waitFor(() => expect(apiMock.marketNews).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Minor local event with low financial impact')).toBeTruthy();
  });

  it('orders news from most recent to oldest', async () => {
    const { container } = render(<News />);

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    await waitFor(() => expect(apiMock.marketNews).toHaveBeenCalledTimes(2));

    const headlines = [...container.querySelectorAll('.news-headline')].map((node) => node.textContent);
    expect(headlines[0]).toBe('OPEC updates oil supply expectations');
    expect(headlines[1]).toBe('Fed signals inflation risk for global markets');
  });

  it('filters by keyword search', async () => {
    render(<News />);
    await waitFor(() => expect(apiMock.marketNewsRecommended).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText(/Buscar por palabra clave/i), { target: { value: 'opec' } });

    expect(screen.getByText('OPEC updates oil supply expectations')).toBeTruthy();
    expect(screen.queryByText('Fed signals inflation risk for global markets')).toBeNull();
  });
});
