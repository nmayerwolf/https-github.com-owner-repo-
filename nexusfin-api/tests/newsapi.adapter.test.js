const { createNewsApiAdapter } = require('../src/providers/NewsApiAdapter');

describe('NewsApiAdapter', () => {
  test('maps article fields to domain shape', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        articles: [
          {
            publishedAt: '2026-02-23T10:00:00Z',
            title: 'Fed signals pause',
            description: 'Rates in focus',
            source: { name: 'Reuters' },
            url: 'https://example.com/a',
            urlToImage: 'https://example.com/a.png'
          }
        ]
      })
    }));

    const adapter = createNewsApiAdapter({ apiKey: 'k', fetchImpl, timeoutMs: 2000 });
    const out = await adapter.getTopHeadlines({ language: 'en', pageSize: 10 });

    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Fed signals pause');
    expect(out[0].sourceName).toBe('Reuters');
    expect(out[0].sources[0].vendor).toBe('newsapi');
  });
});
