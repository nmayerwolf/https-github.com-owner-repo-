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
  { symbol: 'XRPUSDT', name: 'XRP', category: 'crypto', sector: 'crypto', source: 'finnhub_crypto' },
  { symbol: 'BNBUSDT', name: 'BNB', category: 'crypto', sector: 'crypto', source: 'finnhub_crypto' },
  { symbol: 'EUR_USD', name: 'EUR/USD', category: 'fx', sector: 'fx', source: 'finnhub_fx' },
  { symbol: 'GBP_USD', name: 'GBP/USD', category: 'fx', sector: 'fx', source: 'finnhub_fx' },
  { symbol: 'USD_JPY', name: 'USD/JPY', category: 'fx', sector: 'fx', source: 'finnhub_fx' },
  { symbol: 'USD_CHF', name: 'USD/CHF', category: 'fx', sector: 'fx', source: 'finnhub_fx' },
  { symbol: 'AUD_USD', name: 'AUD/USD', category: 'fx', sector: 'fx', source: 'finnhub_fx' },
  { symbol: 'USD_CAD', name: 'USD/CAD', category: 'fx', sector: 'fx', source: 'finnhub_fx' },
  { symbol: 'SPY', name: 'S&P 500 (ETF)', category: 'equity', sector: 'indices', source: 'finnhub_stock' },
  { symbol: 'QQQ', name: 'NASDAQ (ETF)', category: 'equity', sector: 'indices', source: 'finnhub_stock' },
  { symbol: 'DIA', name: 'DOW (ETF)', category: 'equity', sector: 'indices', source: 'finnhub_stock' },
  { symbol: 'IWM', name: 'Russell 2000 (ETF)', category: 'equity', sector: 'indices', source: 'finnhub_stock' },
  { symbol: 'VTI', name: 'US Total Market (ETF)', category: 'equity', sector: 'indices', source: 'finnhub_stock' },
  { symbol: 'EEM', name: 'Emerging Markets (ETF)', category: 'equity', sector: 'indices', source: 'finnhub_stock' },
  { symbol: 'TLT', name: 'US 20Y Treasury (ETF)', category: 'bond', sector: 'bonds', source: 'finnhub_stock' },
  { symbol: 'IEF', name: 'US 7-10Y Treasury (ETF)', category: 'bond', sector: 'bonds', source: 'finnhub_stock' },
  { symbol: 'LQD', name: 'Investment Grade Bonds (ETF)', category: 'bond', sector: 'bonds', source: 'finnhub_stock' },
  { symbol: 'HYG', name: 'High Yield Bonds (ETF)', category: 'bond', sector: 'bonds', source: 'finnhub_stock' },
  { symbol: 'GLD', name: 'Gold (ETF)', category: 'metal', sector: 'metals', source: 'finnhub_stock' },
  { symbol: 'SLV', name: 'Silver (ETF)', category: 'metal', sector: 'metals', source: 'finnhub_stock' },
  { symbol: 'USO', name: 'US Oil (ETF)', category: 'commodity', sector: 'energy', source: 'finnhub_stock' },
  { symbol: 'UNG', name: 'Natural Gas (ETF)', category: 'commodity', sector: 'energy', source: 'finnhub_stock' }
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
