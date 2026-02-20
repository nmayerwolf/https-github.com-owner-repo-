/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getRecoToday: vi.fn()
  }
}));

vi.mock('../../api/apiClient', () => ({ api: apiMock }));

import Ideas from '../Ideas';

afterEach(() => {
  cleanup();
});

describe('Ideas', () => {
  const renderWithLanguage = (ui) => render(<LanguageProvider initialLanguage="en">{ui}</LanguageProvider>);

  beforeEach(() => {
    apiMock.getRecoToday.mockReset();
    apiMock.getRecoToday.mockResolvedValue({
      date: '2026-02-20',
      strategic: [{ ideaId: 's1', symbol: 'SPY', action: 'WATCH', confidence: 0.8, rationale: ['Sesgo constructivo'], risks: ['Volatilidad moderada'] }],
      opportunistic: [{ ideaId: 'o1', symbol: 'NVDA', action: 'BUY', confidence: 0.7, rationale: ['Momentum'], risks: ['Gap risk'], opportunisticType: 'momentum_fade' }],
      risk_alerts: [{ title: 'Narrow breadth', severity: 'medium', bullets: ['Only 58% above 50d'], tags: ['breadth'] }]
    });
  });

  it('renders sections from reco endpoint', async () => {
    renderWithLanguage(<Ideas />);

    await waitFor(() => expect(apiMock.getRecoToday).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Strategic Ideas')).toBeTruthy();
    expect(screen.getByText('SPY')).toBeTruthy();
    expect(screen.getByText('Opportunistic')).toBeTruthy();
    expect(screen.getByText('Risk Alerts')).toBeTruthy();
  });

  it('supports section collapse', async () => {
    renderWithLanguage(<Ideas />);
    await waitFor(() => expect(apiMock.getRecoToday).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /Strategic Ideas/i }));
    expect(screen.queryByText('SPY')).toBeNull();
  });
});
