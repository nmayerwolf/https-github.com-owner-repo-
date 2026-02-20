/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getRecoToday: vi.fn(),
    getCrisisToday: vi.fn()
  }
}));

vi.mock('../../api/apiClient', () => ({ api: apiMock }));

import Ideas from '../Ideas';

afterEach(() => {
  cleanup();
});

describe('Ideas', () => {
  beforeEach(() => {
    apiMock.getRecoToday.mockReset();
    apiMock.getCrisisToday.mockReset();
    apiMock.getRecoToday.mockResolvedValue({
      sections: {
        strategic: [{ ideaId: 's1', symbol: 'SPY', action: 'WATCH', confidence: 0.8, rationale: ['Sesgo constructivo'], risks: ['Volatilidad moderada'] }],
        opportunistic: [],
        riskAlerts: []
      }
    });
    apiMock.getCrisisToday.mockResolvedValue({
      isActive: false,
      summary: 'Sin crisis activa.'
    });
  });

  it('renders daily ideas from reco endpoint', async () => {
    render(<Ideas />);
    await waitFor(() => expect(apiMock.getRecoToday).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Strategic Ideas')).toBeTruthy();
    expect(screen.getByText('SPY')).toBeTruthy();
  });
});
