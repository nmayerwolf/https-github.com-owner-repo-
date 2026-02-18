const { rankNews } = require('../src/services/newsRanker');

describe('newsRanker', () => {
  it('applies soft theme CTR boost when enough sample exists', () => {
    const now = Math.floor(Date.now() / 1000);
    const items = [
      {
        id: 1,
        headline: 'Fed policy update',
        summary: 'Macro policy guidance',
        datetime: now - 120,
        related: ''
      },
      {
        id: 2,
        headline: 'Bitcoin outlook update',
        summary: 'Crypto market policy',
        datetime: now - 110,
        related: ''
      }
    ];

    const baseline = rankNews(items, { minScore: 0, limit: 10, diversify: false });
    const boosted = rankNews(items, {
      minScore: 0,
      limit: 10,
      diversify: false,
      themeCtrBoost: { macro: 30, crypto: 0 }
    });

    const baselineMacro = baseline.find((x) => x.id === 1);
    const boostedMacro = boosted.find((x) => x.id === 1);
    expect(Number(boostedMacro.aiScore)).toBeGreaterThan(Number(baselineMacro.aiScore));
    expect(Number(boostedMacro.aiThemeCtr)).toBe(30);
    expect(Number(boostedMacro.aiThemeCtrBoost)).toBeGreaterThan(0);
  });

  it('caps CTR boost to avoid overfitting ranking', () => {
    const now = Math.floor(Date.now() / 1000);
    const items = [{ id: 3, headline: 'Fed inflation update', summary: 'Macro', datetime: now - 60 }];
    const boosted = rankNews(items, {
      minScore: 0,
      limit: 10,
      diversify: false,
      themeCtrBoost: { macro: 999 }
    });
    expect(Number(boosted[0].aiThemeCtrBoost)).toBeLessThanOrEqual(4);
  });
});

