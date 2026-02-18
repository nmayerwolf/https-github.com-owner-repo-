import { DEFAULT_USER_CONFIG } from '../../packages/nexusfin-core/contracts.js';

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
  ...DEFAULT_USER_CONFIG,
  sectors: [...DEFAULT_USER_CONFIG.sectors]
};

export const DEFAULT_WATCHLIST = [
  { symbol: 'META', name: 'Meta', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'NVDA', name: 'NVIDIA', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'AAPL', name: 'Apple', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'GOOGL', name: 'Alphabet', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'TSLA', name: 'Tesla', category: 'equity', sector: 'auto', source: 'finnhub_stock' },
  { symbol: 'EUR_USD', name: 'USD/Euro', category: 'fx', sector: 'fx', source: 'finnhub_fx' },
  { symbol: 'USD_CHF', name: 'USD/CHF', category: 'fx', sector: 'fx', source: 'finnhub_fx' },
  { symbol: 'GLD', name: 'Gold (ETF)', category: 'metal', sector: 'metals', source: 'finnhub_stock' },
  { symbol: 'SOYB', name: 'Soybean (ETF)', category: 'commodity', sector: 'agriculture', source: 'finnhub_stock' },
  { symbol: 'AMZN', name: 'Amazon', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'DIA', name: 'Dow Jones (ETF)', category: 'equity', sector: 'indices', source: 'finnhub_stock' },
  { symbol: 'QQQ', name: 'NASDAQ (ETF)', category: 'equity', sector: 'indices', source: 'finnhub_stock' },
  { symbol: 'SPY', name: 'S&P 500 (ETF)', category: 'equity', sector: 'indices', source: 'finnhub_stock' }
];

export const WATCHLIST_CATALOG = [
  ...DEFAULT_WATCHLIST,
  { symbol: 'V', name: 'Visa', category: 'equity', sector: 'finance', source: 'finnhub_stock' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', category: 'equity', sector: 'health', source: 'finnhub_stock' },
  { symbol: 'NFLX', name: 'Netflix', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'BABA', name: 'Alibaba', category: 'equity', sector: 'tech', source: 'finnhub_stock' },
  { symbol: 'GDX', name: 'Gold Miners (ETF)', category: 'metal', sector: 'metals', source: 'finnhub_stock' },
  { symbol: 'DBA', name: 'Agriculture (ETF)', category: 'commodity', sector: 'energy', source: 'finnhub_stock' }
];

export const CATEGORY_OPTIONS = ['all', 'equity', 'crypto', 'metal', 'commodity', 'bond', 'fx'];
