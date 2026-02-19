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
  { symbol: 'META', name: 'Meta', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'NVDA', name: 'NVIDIA', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'AAPL', name: 'Apple', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'GOOGL', name: 'Alphabet', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'TSLA', name: 'Tesla', category: 'equity', sector: 'auto', source: 'finnhub' },
  { symbol: 'EUR_USD', name: 'USD/Euro', category: 'fx', sector: 'fx', source: 'finnhub' },
  { symbol: 'USD_CHF', name: 'USD/CHF', category: 'fx', sector: 'fx', source: 'finnhub' },
  { symbol: 'XAU_USD', name: 'Gold Spot (XAU/USD)', category: 'metal', sector: 'metals', source: 'finnhub' },
  { symbol: 'SOYB', name: 'Soybean (ETF)', category: 'commodity', sector: 'agriculture', source: 'finnhub' },
  { symbol: 'AMZN', name: 'Amazon', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'DIA', name: 'Dow Jones (ETF)', category: 'equity', sector: 'indices', source: 'finnhub' },
  { symbol: 'QQQ', name: 'NASDAQ (ETF)', category: 'equity', sector: 'indices', source: 'finnhub' },
  { symbol: 'SPY', name: 'S&P 500 (ETF)', category: 'equity', sector: 'indices', source: 'finnhub' }
];

export const WATCHLIST_CATALOG = [
  ...DEFAULT_WATCHLIST,
  { symbol: 'V', name: 'Visa', category: 'equity', sector: 'finance', source: 'finnhub' },
  { symbol: 'MA', name: 'Mastercard', category: 'equity', sector: 'finance', source: 'finnhub' },
  { symbol: 'KO', name: 'Coca-Cola', category: 'equity', sector: 'consumer', source: 'finnhub' },
  { symbol: 'PEP', name: 'PepsiCo', category: 'equity', sector: 'consumer', source: 'finnhub' },
  { symbol: 'WMT', name: 'Walmart', category: 'equity', sector: 'consumer', source: 'finnhub' },
  { symbol: 'COST', name: 'Costco', category: 'equity', sector: 'consumer', source: 'finnhub' },
  { symbol: 'UNH', name: 'UnitedHealth', category: 'equity', sector: 'health', source: 'finnhub' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', category: 'equity', sector: 'health', source: 'finnhub' },
  { symbol: 'PFE', name: 'Pfizer', category: 'equity', sector: 'health', source: 'finnhub' },
  { symbol: 'CRM', name: 'Salesforce', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'ORCL', name: 'Oracle', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'AMD', name: 'AMD', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'INTC', name: 'Intel', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'NFLX', name: 'Netflix', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'UBER', name: 'Uber', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'ABNB', name: 'Airbnb', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'BABA', name: 'Alibaba', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'MELI', name: 'MercadoLibre', category: 'equity', sector: 'tech', source: 'finnhub' },
  { symbol: 'VALE', name: 'Vale', category: 'equity', sector: 'materials', source: 'finnhub' },
  { symbol: 'PBR', name: 'Petrobras', category: 'equity', sector: 'energy', source: 'finnhub' },
  { symbol: 'VTI', name: 'Total Market ETF', category: 'equity', sector: 'indices', source: 'finnhub' },
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', category: 'equity', sector: 'indices', source: 'finnhub' },
  { symbol: 'EEM', name: 'Emerging Markets ETF', category: 'equity', sector: 'indices', source: 'finnhub' },
  { symbol: 'GDX', name: 'Gold Miners (ETF)', category: 'metal', sector: 'metals', source: 'finnhub' },
  { symbol: '^MERV', name: 'S&P Merval (Argentina)', category: 'equity', sector: 'indices', source: 'finnhub' },
  { symbol: 'DBA', name: 'Agriculture (ETF)', category: 'commodity', sector: 'energy', source: 'finnhub' },
  { symbol: 'AVAXUSDT', name: 'Avalanche', category: 'crypto', sector: 'crypto', source: 'finnhub' },
  { symbol: 'DOTUSDT', name: 'Polkadot', category: 'crypto', sector: 'crypto', source: 'finnhub' },
  { symbol: 'LINKUSDT', name: 'Chainlink', category: 'crypto', sector: 'crypto', source: 'finnhub' },
  { symbol: 'LTCUSDT', name: 'Litecoin', category: 'crypto', sector: 'crypto', source: 'finnhub' },
  { symbol: 'NZD_USD', name: 'NZD/USD', category: 'fx', sector: 'fx', source: 'finnhub' },
  { symbol: 'EUR_JPY', name: 'EUR/JPY', category: 'fx', sector: 'fx', source: 'finnhub' },
  { symbol: 'USD_BRL', name: 'USD/BRL', category: 'fx', sector: 'fx', source: 'finnhub' }
];

export const CATEGORY_OPTIONS = ['all', 'equity', 'crypto', 'metal', 'commodity', 'bond', 'fx'];
