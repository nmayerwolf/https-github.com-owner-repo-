export const COLORS = {
  bg: '#080F1E',
  surface: 'rgba(255,255,255,0.03)',
  border: 'rgba(255,255,255,0.08)',
  primary: '#00E08E',
  danger: '#FF4757',
  warning: '#FBBF24',
  info: '#60A5FA',
  textPrimary: '#E0E7F0',
  textSecondary: '#6B7B8D'
};

export const DEFAULT_CONFIG = {
  riskProfile: 'moderado',
  horizon: 'mediano',
  sectors: ['tech', 'crypto', 'metals'],
  maxPE: 50,
  minDivYield: 0,
  minMktCap: 100,
  rsiOS: 30,
  rsiOB: 70,
  volThresh: 2,
  minConfluence: 2
};

export const DEFAULT_WATCHLIST = [
  { symbol: 'AAPL', name: 'Apple', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'NVDA', name: 'NVIDIA', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'MSFT', name: 'Microsoft', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'GOOGL', name: 'Alphabet', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'AMZN', name: 'Amazon', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'META', name: 'Meta', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'TSLA', name: 'Tesla', category: 'equity', sector: 'auto', source: 'finnhub_stock' },
  { symbol: 'JPM', name: 'JPMorgan', category: 'equity', sector: 'finance', source: 'finnhub_stock' },
  { symbol: 'XOM', name: 'Exxon', category: 'equity', sector: 'energy', source: 'finnhub_stock' },
  { symbol: 'BTCUSDT', name: 'Bitcoin', category: 'crypto', sector: 'crypto', source: 'finnhub_crypto' },
  { symbol: 'ETHUSDT', name: 'Ethereum', category: 'crypto', sector: 'crypto', source: 'finnhub_crypto' },
  { symbol: 'SOLUSDT', name: 'Solana', category: 'crypto', sector: 'crypto', source: 'finnhub_crypto' },
  { symbol: 'EUR_USD', name: 'EUR/USD', category: 'fx', sector: 'fx', source: 'finnhub_fx' },
  { symbol: 'GBP_USD', name: 'GBP/USD', category: 'fx', sector: 'fx', source: 'finnhub_fx' },
  { symbol: 'SPY', name: 'S&P 500 (ETF)', category: 'equity', sector: 'indices', source: 'finnhub_stock' },
  { symbol: 'QQQ', name: 'NASDAQ (ETF)', category: 'equity', sector: 'indices', source: 'finnhub_stock' },
  { symbol: 'DIA', name: 'DOW (ETF)', category: 'equity', sector: 'indices', source: 'finnhub_stock' }
];

export const WATCHLIST_CATALOG = [
  ...DEFAULT_WATCHLIST,
  { symbol: 'V', name: 'Visa', category: 'equity', sector: 'finance', source: 'finnhub_stock' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', category: 'equity', sector: 'health', source: 'finnhub_stock' },
  { symbol: 'NFLX', name: 'Netflix', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'BABA', name: 'Alibaba', category: 'equity', sector: 'tech', source: 'finnhub_stock' }
];

export const CATEGORY_OPTIONS = ['all', 'equity', 'crypto', 'metal', 'commodity', 'bond', 'fx'];
