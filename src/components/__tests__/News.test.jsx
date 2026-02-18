/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, appCtxMock } = vi.hoisted(() => ({
  apiMock: {
    marketNews: vi.fn(),
    marketNewsRecommended: vi.fn(),
    trackNewsTelemetry: vi.fn()
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
    window.localStorage.clear();
    apiMock.marketNewsRecommended.mockReset();
    apiMock.marketNews.mockReset();
    apiMock.trackNewsTelemetry.mockReset();
    apiMock.marketNewsRecommended.mockResolvedValue({
      items: [
        {
          id: 'r1',
          headline: 'Fed signals inflation risk for global markets',
          summary: 'Macro outlook shifts after central bank guidance.',
          source: 'Reuters',
          related: 'AAPL,MSFT',
          datetime: nowSec - 60,
          aiScore: 17,
          aiReasons: ['high:inflation', 'high:fed'],
          url: 'https://example.com/r1'
        },
        {
          id: 'r2',
          headline: 'OPEC updates oil supply expectations',
          summary: 'Energy markets react to new production targets.',
          source: 'Bloomberg',
          related: 'XOM,CVX',
          datetime: nowSec - 30,
          aiScore: 12,
          aiReasons: ['high:opec'],
          url: 'https://example.com/r2'
        }
      ]
    });
    apiMock.marketNews.mockResolvedValue(baseItems);
    apiMock.trackNewsTelemetry.mockResolvedValue({ ok: true });
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows all news by default', async () => {
    render(<News />);

    await waitFor(() => expect(apiMock.marketNews).toHaveBeenCalledTimes(1));
    expect(apiMock.marketNewsRecommended).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Fed signals inflation risk for global markets').length).toBeGreaterThan(0);
    expect(screen.getByText('Minor local event with low financial impact')).toBeTruthy();
    expect(screen.getAllByText(/Muy relevante|Relevante|Poco relevante/).length).toBeGreaterThan(0);
  });

  it('orders news from most recent to oldest', async () => {
    render(<News />);
    await waitFor(() => expect(apiMock.marketNews).toHaveBeenCalledTimes(1));

    const allNewsSection = screen.getByText('Todas las noticias').closest('section');
    const headlines = [...allNewsSection.querySelectorAll('.news-headline')].map((node) => node.textContent);
    expect(headlines[0]).toBe('OPEC updates oil supply expectations');
    expect(headlines[1]).toBe('Fed signals inflation risk for global markets');
  });

  it('filters by keyword search', async () => {
    render(<News />);
    await waitFor(() => expect(apiMock.marketNews).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText(/Buscar en todas/i), { target: { value: 'opec' } });

    const allNewsSection = screen.getByText('Todas las noticias').closest('section');
    expect(within(allNewsSection).getByText('OPEC updates oil supply expectations')).toBeTruthy();
    expect(within(allNewsSection).queryByText('Fed signals inflation risk for global markets')).toBeNull();
  });

  it('shows impact badge classification per news item', async () => {
    render(<News />);
    await waitFor(() => expect(apiMock.marketNews).toHaveBeenCalledTimes(1));

    expect(screen.getByText('Muy relevante')).toBeTruthy();
    expect(screen.getByText('Relevante')).toBeTruthy();
  });

  it('persists search queries between mounts', async () => {
    const { unmount } = render(<News />);
    await waitFor(() => expect(apiMock.marketNews).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText(/Buscar en recomendadas/i), { target: { value: 'inflación' } });
    fireEvent.change(screen.getByPlaceholderText(/Buscar en todas/i), { target: { value: 'china' } });

    unmount();
    render(<News />);
    await waitFor(() => expect(apiMock.marketNews).toHaveBeenCalledTimes(2));

    expect(screen.getByPlaceholderText(/Buscar en recomendadas/i).value).toBe('inflación');
    expect(screen.getByPlaceholderText(/Buscar en todas/i).value).toBe('china');
  });
});
