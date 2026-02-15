const { createAiAgent, extractJsonBlock } = require('../src/services/aiAgent');

describe('aiAgent service', () => {
  test('extractJsonBlock parses plain and wrapped json', () => {
    expect(extractJsonBlock('{"confirm":true}')).toEqual({ confirm: true });
    expect(extractJsonBlock('texto {"confirm":false,"reasoning":"x"} fin')).toEqual({ confirm: false, reasoning: 'x' });
  });

  test('validateSignal returns fallback when ai is disabled', async () => {
    const ai = createAiAgent({ enabled: false, apiKey: '' });
    const out = await ai.validateSignal({
      candidate: { confidence: 'high', stopLoss: 90, takeProfit: 120 }
    });

    expect(out.mode).toBe('fallback');
    expect(out.aiValidated).toBe(false);
    expect(out.confidence).toBe('medium');
  });

  test('validateSignal parses anthropic json response', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            text: JSON.stringify({
              confirm: true,
              confidence: 'high',
              action: 'BUY',
              thesis: 'Señal válida',
              catalysts: ['cat1'],
              risks: ['risk1'],
              technicalView: 'ok',
              fundamentalView: 'ok',
              adjustedStopLoss: 88.5,
              adjustedTarget: 131.2,
              timeframe: '2 semanas',
              reasoning: 'confluencia + volumen'
            })
          }
        ]
      })
    }));

    const ai = createAiAgent({ enabled: true, apiKey: 'sk-test', model: 'claude-haiku-4-5-20251001', timeoutMs: 1500 });
    const out = await ai.validateSignal({
      candidate: { confidence: 'medium', stopLoss: 90, takeProfit: 120, recommendation: 'BUY', symbol: 'AAPL' },
      userConfig: { riskProfile: 'moderado', horizon: 'mediano' }
    });

    expect(out.mode).toBe('validated');
    expect(out.confirm).toBe(true);
    expect(out.aiValidated).toBe(true);
    expect(out.confidence).toBe('high');
    expect(out.adjustedStopLoss).toBe(88.5);
    expect(out.adjustedTarget).toBe(131.2);

    global.fetch = originalFetch;
  });
});
