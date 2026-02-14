export const MOBILE_MARKET_UNIVERSE = [
  { id: 'aapl', symbol: 'AAPL', wsSymbol: 'AAPL', name: 'Apple', category: 'equity' },
  { id: 'nvda', symbol: 'NVDA', wsSymbol: 'NVDA', name: 'NVIDIA', category: 'equity' },
  { id: 'msft', symbol: 'MSFT', wsSymbol: 'MSFT', name: 'Microsoft', category: 'equity' },

  { id: 'spy', symbol: 'SPY', wsSymbol: 'SPY', name: 'S&P 500 ETF', category: 'etf' },
  { id: 'qqq', symbol: 'QQQ', wsSymbol: 'QQQ', name: 'Nasdaq ETF', category: 'etf' },
  { id: 'dia', symbol: 'DIA', wsSymbol: 'DIA', name: 'Dow Jones ETF', category: 'etf' },
  { id: 'iwm', symbol: 'IWM', wsSymbol: 'IWM', name: 'Russell 2000 ETF', category: 'etf' },

  { id: 'tlt', symbol: 'TLT', wsSymbol: 'TLT', name: 'US 20Y Treasury ETF', category: 'bond' },
  { id: 'ief', symbol: 'IEF', wsSymbol: 'IEF', name: 'US 7-10Y Treasury ETF', category: 'bond' },
  { id: 'lqd', symbol: 'LQD', wsSymbol: 'LQD', name: 'IG Corporate Bonds ETF', category: 'bond' },

  { id: 'gld', symbol: 'GLD', wsSymbol: 'GLD', name: 'Gold ETF', category: 'metal' },
  { id: 'slv', symbol: 'SLV', wsSymbol: 'SLV', name: 'Silver ETF', category: 'metal' },

  { id: 'uso', symbol: 'USO', wsSymbol: 'USO', name: 'Oil ETF', category: 'commodity' },
  { id: 'ung', symbol: 'UNG', wsSymbol: 'UNG', name: 'Natural Gas ETF', category: 'commodity' },

  { id: 'btc', symbol: 'BTCUSDT', wsSymbol: 'BINANCE:BTCUSDT', name: 'Bitcoin', category: 'crypto' },
  { id: 'eth', symbol: 'ETHUSDT', wsSymbol: 'BINANCE:ETHUSDT', name: 'Ethereum', category: 'crypto' },
  { id: 'sol', symbol: 'SOLUSDT', wsSymbol: 'BINANCE:SOLUSDT', name: 'Solana', category: 'crypto' },

  { id: 'eurusd', symbol: 'EUR_USD', wsSymbol: 'OANDA:EUR_USD', name: 'EUR/USD', category: 'fx' },
  { id: 'gbpusd', symbol: 'GBP_USD', wsSymbol: 'OANDA:GBP_USD', name: 'GBP/USD', category: 'fx' },
  { id: 'usdjpy', symbol: 'USD_JPY', wsSymbol: 'OANDA:USD_JPY', name: 'USD/JPY', category: 'fx' }
];

export const MARKET_CATEGORIES = ['all', 'equity', 'etf', 'bond', 'metal', 'commodity', 'crypto', 'fx'];
