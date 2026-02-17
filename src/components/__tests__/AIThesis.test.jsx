/* @vitest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AIThesis from '../AIThesis';

describe('AIThesis', () => {
  it('renders expanded detail even when catalysts and risks are plain strings', () => {
    render(
      <AIThesis
        symbol="AAPL"
        onClose={vi.fn()}
        thesis={{
          summary: 'Resumen corto',
          action: 'BUY',
          confidence: 'high',
          timeframe: '1w',
          priceTarget: 220,
          catalysts: 'Catalizador 1\nCatalizador 2',
          risks: 'Riesgo 1\nRiesgo 2',
          technicalView: 'RSI en recuperación',
          fundamentalView: 'Márgenes sólidos',
          suitability: 'Alineado al perfil moderado'
        }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle completo' }));

    expect(screen.getByText('Catalizador 1')).toBeTruthy();
    expect(screen.getByText('Catalizador 2')).toBeTruthy();
    expect(screen.getByText('Riesgo 1')).toBeTruthy();
    expect(screen.getByText('Riesgo 2')).toBeTruthy();
  });
});
