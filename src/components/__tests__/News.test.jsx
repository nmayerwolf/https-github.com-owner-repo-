/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getDigestToday: vi.fn(),
    getCrisisToday: vi.fn()
  }
}));

vi.mock('../../api/apiClient', () => ({ api: apiMock }));

import News from '../News';

afterEach(() => {
  cleanup();
});

describe('NewsDigest', () => {
  beforeEach(() => {
    apiMock.getDigestToday.mockReset();
    apiMock.getCrisisToday.mockReset();
    apiMock.getDigestToday.mockResolvedValue({
      date: '2026-02-20',
      regime_label: 'Supportive',
      volatility_label: 'Calm',
      confidence_label: 'High',
      bullets: ['S&P 500 extended above its 50-day moving average.'],
      key_risks: ['Market breadth narrowing to 58%'],
      leadership: ['Technology'],
      macro_drivers: ['Dollar weakness']
    });
    apiMock.getCrisisToday.mockResolvedValue({ isActive: false });
  });

  it('renders digest, risks and pills', async () => {
    render(<News />);

    await waitFor(() => expect(apiMock.getDigestToday).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Market Environment')).toBeTruthy();
    expect(screen.getByText('Supportive')).toBeTruthy();
    expect(screen.getByText('S&P 500 extended above its 50-day moving average.')).toBeTruthy();
    expect(screen.getByText('Key Risks')).toBeTruthy();
    expect(screen.getByText('Technology')).toBeTruthy();
  });

  it('shows pending message when digest is pending', async () => {
    apiMock.getDigestToday.mockResolvedValueOnce({ pending: true });

    render(<News />);

    expect(await screen.findByText(/Today's briefing will be available/i)).toBeTruthy();
  });

  it('shows retry on error', async () => {
    apiMock.getDigestToday.mockRejectedValueOnce(new Error('fail'));

    render(<News />);

    expect(await screen.findByText(/Could not load data/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(apiMock.getDigestToday).toHaveBeenCalledTimes(2));
  });
});
