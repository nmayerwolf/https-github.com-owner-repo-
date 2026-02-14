const MARKET_UNIVERSE = [
  { id: 'aapl', symbol: 'AAPL', wsSymbol: 'AAPL', name: 'Apple', category: 'equity' },
  { id: 'msft', symbol: 'MSFT', wsSymbol: 'MSFT', name: 'Microsoft', category: 'equity' },
  { id: 'nvda', symbol: 'NVDA', wsSymbol: 'NVDA', name: 'NVIDIA', category: 'equity' },
  { id: 'amzn', symbol: 'AMZN', wsSymbol: 'AMZN', name: 'Amazon', category: 'equity' },
  { id: 'googl', symbol: 'GOOGL', wsSymbol: 'GOOGL', name: 'Alphabet', category: 'equity' },
  { id: 'meta', symbol: 'META', wsSymbol: 'META', name: 'Meta', category: 'equity' },
  { id: 'tsla', symbol: 'TSLA', wsSymbol: 'TSLA', name: 'Tesla', category: 'equity' },
  { id: 'brkb', symbol: 'BRK.B', wsSymbol: 'BRK.B', name: 'Berkshire Hathaway B', category: 'equity' },
  { id: 'jpm', symbol: 'JPM', wsSymbol: 'JPM', name: 'JPMorgan', category: 'equity' },
  { id: 'xom', symbol: 'XOM', wsSymbol: 'XOM', name: 'Exxon Mobil', category: 'equity' },

  { id: 'spy', symbol: 'SPY', wsSymbol: 'SPY', name: 'S&P 500 ETF', category: 'etf' },
  { id: 'qqq', symbol: 'QQQ', wsSymbol: 'QQQ', name: 'Nasdaq 100 ETF', category: 'etf' },
  { id: 'dia', symbol: 'DIA', wsSymbol: 'DIA', name: 'Dow Jones ETF', category: 'etf' },
  { id: 'iwm', symbol: 'IWM', wsSymbol: 'IWM', name: 'Russell 2000 ETF', category: 'etf' },
  { id: 'xlf', symbol: 'XLF', wsSymbol: 'XLF', name: 'Financials ETF', category: 'etf' },
  { id: 'xle', symbol: 'XLE', wsSymbol: 'XLE', name: 'Energy ETF', category: 'etf' },
  { id: 'xlk', symbol: 'XLK', wsSymbol: 'XLK', name: 'Technology ETF', category: 'etf' },
  { id: 'arkk', symbol: 'ARKK', wsSymbol: 'ARKK', name: 'Innovation ETF', category: 'etf' },

  { id: 'tlt', symbol: 'TLT', wsSymbol: 'TLT', name: 'US 20Y Treasury ETF', category: 'bond' },
  { id: 'ief', symbol: 'IEF', wsSymbol: 'IEF', name: 'US 7-10Y Treasury ETF', category: 'bond' },
  { id: 'shy', symbol: 'SHY', wsSymbol: 'SHY', name: 'US 1-3Y Treasury ETF', category: 'bond' },
  { id: 'tip', symbol: 'TIP', wsSymbol: 'TIP', name: 'TIPS ETF', category: 'bond' },
  { id: 'lqd', symbol: 'LQD', wsSymbol: 'LQD', name: 'IG Corporate Bonds ETF', category: 'bond' },
  { id: 'hyg', symbol: 'HYG', wsSymbol: 'HYG', name: 'High Yield Bonds ETF', category: 'bond' },

  { id: 'gld', symbol: 'GLD', wsSymbol: 'GLD', name: 'Gold ETF', category: 'metal' },
  { id: 'slv', symbol: 'SLV', wsSymbol: 'SLV', name: 'Silver ETF', category: 'metal' },
  { id: 'pplt', symbol: 'PPLT', wsSymbol: 'PPLT', name: 'Platinum ETF', category: 'metal' },
  { id: 'pall', symbol: 'PALL', wsSymbol: 'PALL', name: 'Palladium ETF', category: 'metal' },
  { id: 'cper', symbol: 'CPER', wsSymbol: 'CPER', name: 'Copper ETF', category: 'metal' },

  { id: 'uso', symbol: 'USO', wsSymbol: 'USO', name: 'Oil ETF', category: 'commodity' },
  { id: 'bno', symbol: 'BNO', wsSymbol: 'BNO', name: 'Brent Oil ETF', category: 'commodity' },
  { id: 'ung', symbol: 'UNG', wsSymbol: 'UNG', name: 'Natural Gas ETF', category: 'commodity' },
  { id: 'dbc', symbol: 'DBC', wsSymbol: 'DBC', name: 'Broad Commodity ETF', category: 'commodity' },
  { id: 'corn', symbol: 'CORN', wsSymbol: 'CORN', name: 'Corn ETF', category: 'commodity' },
  { id: 'weat', symbol: 'WEAT', wsSymbol: 'WEAT', name: 'Wheat ETF', category: 'commodity' },

  { id: 'btc', symbol: 'BTCUSDT', wsSymbol: 'BINANCE:BTCUSDT', name: 'Bitcoin', category: 'crypto' },
  { id: 'eth', symbol: 'ETHUSDT', wsSymbol: 'BINANCE:ETHUSDT', name: 'Ethereum', category: 'crypto' },
  { id: 'sol', symbol: 'SOLUSDT', wsSymbol: 'BINANCE:SOLUSDT', name: 'Solana', category: 'crypto' },
  { id: 'bnb', symbol: 'BNBUSDT', wsSymbol: 'BINANCE:BNBUSDT', name: 'BNB', category: 'crypto' },
  { id: 'xrp', symbol: 'XRPUSDT', wsSymbol: 'BINANCE:XRPUSDT', name: 'XRP', category: 'crypto' },
  { id: 'ada', symbol: 'ADAUSDT', wsSymbol: 'BINANCE:ADAUSDT', name: 'Cardano', category: 'crypto' },
  { id: 'doge', symbol: 'DOGEUSDT', wsSymbol: 'BINANCE:DOGEUSDT', name: 'Dogecoin', category: 'crypto' },

  { id: 'eurusd', symbol: 'EUR_USD', wsSymbol: 'OANDA:EUR_USD', name: 'EUR/USD', category: 'fx' },
  { id: 'gbpusd', symbol: 'GBP_USD', wsSymbol: 'OANDA:GBP_USD', name: 'GBP/USD', category: 'fx' },
  { id: 'usdjpy', symbol: 'USD_JPY', wsSymbol: 'OANDA:USD_JPY', name: 'USD/JPY', category: 'fx' },
  { id: 'usdchf', symbol: 'USD_CHF', wsSymbol: 'OANDA:USD_CHF', name: 'USD/CHF', category: 'fx' },
  { id: 'audusd', symbol: 'AUD_USD', wsSymbol: 'OANDA:AUD_USD', name: 'AUD/USD', category: 'fx' },
  { id: 'usdcad', symbol: 'USD_CAD', wsSymbol: 'OANDA:USD_CAD', name: 'USD/CAD', category: 'fx' }
];

module.exports = { MARKET_UNIVERSE };
