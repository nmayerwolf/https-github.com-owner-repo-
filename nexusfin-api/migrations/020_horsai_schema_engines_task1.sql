CREATE TABLE IF NOT EXISTS universe_symbols (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'equity',
  exchange TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_daily_bars (
  symbol TEXT NOT NULL,
  bar_date DATE NOT NULL,
  open NUMERIC,
  high NUMERIC,
  low NUMERIC,
  close NUMERIC NOT NULL,
  volume BIGINT DEFAULT 0,
  previous_close NUMERIC,
  change_pct NUMERIC,
  source TEXT DEFAULT 'finnhub',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (symbol, bar_date)
);

CREATE TABLE IF NOT EXISTS market_metrics_daily (
  symbol TEXT NOT NULL,
  metric_date DATE NOT NULL,
  sma_20 NUMERIC,
  sma_50 NUMERIC,
  sma_200 NUMERIC,
  rsi_14 NUMERIC,
  atr_14 NUMERIC,
  volatility_20d NUMERIC,
  relative_strength NUMERIC,
  sector_rank INTEGER,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (symbol, metric_date)
);

CREATE TABLE IF NOT EXISTS regime_state (
  state_date DATE PRIMARY KEY,
  regime TEXT NOT NULL CHECK (regime IN ('risk_on', 'risk_off', 'transition')),
  volatility_regime TEXT NOT NULL CHECK (volatility_regime IN ('normal', 'elevated', 'crisis')),
  leadership JSONB DEFAULT '[]',
  macro_drivers JSONB DEFAULT '[]',
  risk_flags JSONB DEFAULT '[]',
  confidence NUMERIC NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crisis_state (
  state_date DATE PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT false,
  title TEXT,
  summary TEXT,
  triggers JSONB DEFAULT '[]',
  what_changed JSONB DEFAULT '[]',
  activated_at TIMESTAMPTZ,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_agent_profile (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preset_type TEXT NOT NULL DEFAULT 'balanced' CHECK (preset_type IN ('strategic_core', 'balanced', 'opportunistic')),
  risk_level NUMERIC NOT NULL DEFAULT 0.5 CHECK (risk_level BETWEEN 0 AND 1),
  horizon NUMERIC NOT NULL DEFAULT 0.5 CHECK (horizon BETWEEN 0 AND 1),
  focus NUMERIC NOT NULL DEFAULT 0.5 CHECK (focus BETWEEN 0 AND 1),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE universe_symbols ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE universe_symbols ADD COLUMN IF NOT EXISTS exchange TEXT;
ALTER TABLE universe_symbols ADD COLUMN IF NOT EXISTS active BOOLEAN;
ALTER TABLE universe_symbols ADD COLUMN IF NOT EXISTS asset_type TEXT;
ALTER TABLE universe_symbols ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

UPDATE universe_symbols
SET
  category = COALESCE(category, asset_type, 'equity'),
  active = COALESCE(active, is_active, TRUE),
  is_active = COALESCE(is_active, active, TRUE),
  asset_type = COALESCE(asset_type, category, 'equity');

ALTER TABLE market_daily_bars ADD COLUMN IF NOT EXISTS bar_date DATE;
ALTER TABLE market_daily_bars ADD COLUMN IF NOT EXISTS previous_close NUMERIC;
ALTER TABLE market_daily_bars ADD COLUMN IF NOT EXISTS change_pct NUMERIC;
ALTER TABLE market_daily_bars ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'finnhub';
ALTER TABLE market_daily_bars ADD COLUMN IF NOT EXISTS fetched_at TIMESTAMPTZ DEFAULT NOW();

UPDATE market_daily_bars
SET bar_date = COALESCE(bar_date, date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mdb_symbol_bar_date ON market_daily_bars(symbol, bar_date);
CREATE INDEX IF NOT EXISTS idx_mdb_date ON market_daily_bars(bar_date DESC);

ALTER TABLE market_metrics_daily ADD COLUMN IF NOT EXISTS metric_date DATE;
ALTER TABLE market_metrics_daily ADD COLUMN IF NOT EXISTS sma_20 NUMERIC;
ALTER TABLE market_metrics_daily ADD COLUMN IF NOT EXISTS sma_50 NUMERIC;
ALTER TABLE market_metrics_daily ADD COLUMN IF NOT EXISTS sma_200 NUMERIC;
ALTER TABLE market_metrics_daily ADD COLUMN IF NOT EXISTS rsi_14 NUMERIC;
ALTER TABLE market_metrics_daily ADD COLUMN IF NOT EXISTS atr_14 NUMERIC;
ALTER TABLE market_metrics_daily ADD COLUMN IF NOT EXISTS volatility_20d NUMERIC;
ALTER TABLE market_metrics_daily ADD COLUMN IF NOT EXISTS relative_strength NUMERIC;
ALTER TABLE market_metrics_daily ADD COLUMN IF NOT EXISTS sector_rank INTEGER;
ALTER TABLE market_metrics_daily ADD COLUMN IF NOT EXISTS computed_at TIMESTAMPTZ DEFAULT NOW();

UPDATE market_metrics_daily
SET
  metric_date = COALESCE(metric_date, date),
  sma_20 = COALESCE(sma_20, ma20),
  sma_50 = COALESCE(sma_50, ma50),
  volatility_20d = COALESCE(volatility_20d, vol_20d);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mmd_symbol_metric_date ON market_metrics_daily(symbol, metric_date);

ALTER TABLE regime_state ADD COLUMN IF NOT EXISTS state_date DATE;
ALTER TABLE regime_state ADD COLUMN IF NOT EXISTS computed_at TIMESTAMPTZ DEFAULT NOW();

UPDATE regime_state
SET state_date = COALESCE(state_date, date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_regime_state_state_date ON regime_state(state_date);

ALTER TABLE crisis_state ADD COLUMN IF NOT EXISTS state_date DATE;
ALTER TABLE crisis_state ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE crisis_state ADD COLUMN IF NOT EXISTS what_changed JSONB DEFAULT '[]';
ALTER TABLE crisis_state ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;
ALTER TABLE crisis_state ADD COLUMN IF NOT EXISTS computed_at TIMESTAMPTZ DEFAULT NOW();

UPDATE crisis_state
SET
  state_date = COALESCE(state_date, date),
  activated_at = COALESCE(activated_at, started_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crisis_state_state_date ON crisis_state(state_date);

INSERT INTO universe_symbols (symbol, name, category, asset_type, active, is_active, exchange)
VALUES
  ('AAPL','Apple','equity','equity',TRUE,TRUE,NULL),
  ('MSFT','Microsoft','equity','equity',TRUE,TRUE,NULL),
  ('NVDA','NVIDIA','equity','equity',TRUE,TRUE,NULL),
  ('AMZN','Amazon','equity','equity',TRUE,TRUE,NULL),
  ('GOOGL','Alphabet','equity','equity',TRUE,TRUE,NULL),
  ('META','Meta','equity','equity',TRUE,TRUE,NULL),
  ('TSLA','Tesla','equity','equity',TRUE,TRUE,NULL),
  ('BRK.B','Berkshire Hathaway B','equity','equity',TRUE,TRUE,NULL),
  ('JPM','JPMorgan','equity','equity',TRUE,TRUE,NULL),
  ('XOM','Exxon Mobil','equity','equity',TRUE,TRUE,NULL),
  ('KO','Coca-Cola','equity','equity',TRUE,TRUE,NULL),
  ('PEP','PepsiCo','equity','equity',TRUE,TRUE,NULL),
  ('WMT','Walmart','equity','equity',TRUE,TRUE,NULL),
  ('COST','Costco','equity','equity',TRUE,TRUE,NULL),
  ('DIS','Disney','equity','equity',TRUE,TRUE,NULL),
  ('BAC','Bank of America','equity','equity',TRUE,TRUE,NULL),
  ('GS','Goldman Sachs','equity','equity',TRUE,TRUE,NULL),
  ('V','Visa','equity','equity',TRUE,TRUE,NULL),
  ('MA','Mastercard','equity','equity',TRUE,TRUE,NULL),
  ('UNH','UnitedHealth','equity','equity',TRUE,TRUE,NULL),
  ('JNJ','Johnson & Johnson','equity','equity',TRUE,TRUE,NULL),
  ('PFE','Pfizer','equity','equity',TRUE,TRUE,NULL),
  ('CRM','Salesforce','equity','equity',TRUE,TRUE,NULL),
  ('ORCL','Oracle','equity','equity',TRUE,TRUE,NULL),
  ('ADBE','Adobe','equity','equity',TRUE,TRUE,NULL),
  ('AMD','AMD','equity','equity',TRUE,TRUE,NULL),
  ('INTC','Intel','equity','equity',TRUE,TRUE,NULL),
  ('NFLX','Netflix','equity','equity',TRUE,TRUE,NULL),
  ('UBER','Uber','equity','equity',TRUE,TRUE,NULL),
  ('ABNB','Airbnb','equity','equity',TRUE,TRUE,NULL),
  ('BABA','Alibaba','equity','equity',TRUE,TRUE,NULL),
  ('MELI','MercadoLibre','equity','equity',TRUE,TRUE,NULL),
  ('VALE','Vale','equity','equity',TRUE,TRUE,NULL),
  ('PBR','Petrobras','equity','equity',TRUE,TRUE,NULL),
  ('SPY','S&P 500 ETF','etf','etf',TRUE,TRUE,NULL),
  ('QQQ','Nasdaq 100 ETF','etf','etf',TRUE,TRUE,NULL),
  ('DIA','Dow Jones ETF','etf','etf',TRUE,TRUE,NULL),
  ('IWM','Russell 2000 ETF','etf','etf',TRUE,TRUE,NULL),
  ('XLF','Financials ETF','etf','etf',TRUE,TRUE,NULL),
  ('XLE','Energy ETF','etf','etf',TRUE,TRUE,NULL),
  ('XLK','Technology ETF','etf','etf',TRUE,TRUE,NULL),
  ('ARKK','Innovation ETF','etf','etf',TRUE,TRUE,NULL),
  ('VTI','Vanguard Total Market ETF','etf','etf',TRUE,TRUE,NULL),
  ('VOO','Vanguard S&P 500 ETF','etf','etf',TRUE,TRUE,NULL),
  ('VEA','Vanguard Developed Markets ETF','etf','etf',TRUE,TRUE,NULL),
  ('EEM','Emerging Markets ETF','etf','etf',TRUE,TRUE,NULL),
  ('XLP','Consumer Staples ETF','etf','etf',TRUE,TRUE,NULL),
  ('XLI','Industrials ETF','etf','etf',TRUE,TRUE,NULL),
  ('XLV','Health Care ETF','etf','etf',TRUE,TRUE,NULL),
  ('XLU','Utilities ETF','etf','etf',TRUE,TRUE,NULL),
  ('SMH','Semiconductor ETF','etf','etf',TRUE,TRUE,NULL),
  ('GDX','Gold Miners ETF','etf','etf',TRUE,TRUE,NULL),
  ('DBA','Agriculture ETF','etf','etf',TRUE,TRUE,NULL),
  ('TLT','US 20Y Treasury ETF','bond','bond',TRUE,TRUE,NULL),
  ('IEF','US 7-10Y Treasury ETF','bond','bond',TRUE,TRUE,NULL),
  ('SHY','US 1-3Y Treasury ETF','bond','bond',TRUE,TRUE,NULL),
  ('TIP','TIPS ETF','bond','bond',TRUE,TRUE,NULL),
  ('LQD','IG Corporate Bonds ETF','bond','bond',TRUE,TRUE,NULL),
  ('HYG','High Yield Bonds ETF','bond','bond',TRUE,TRUE,NULL),
  ('GLD','Gold ETF','metal','commodity',TRUE,TRUE,NULL),
  ('XAU_USD','Gold Spot (XAU/USD)','metal','fx',TRUE,TRUE,NULL),
  ('SLV','Silver ETF','metal','commodity',TRUE,TRUE,NULL),
  ('PPLT','Platinum ETF','metal','commodity',TRUE,TRUE,NULL),
  ('PALL','Palladium ETF','metal','commodity',TRUE,TRUE,NULL),
  ('CPER','Copper ETF','metal','commodity',TRUE,TRUE,NULL),
  ('USO','Oil ETF','commodity','commodity',TRUE,TRUE,NULL),
  ('BNO','Brent Oil ETF','commodity','commodity',TRUE,TRUE,NULL),
  ('UNG','Natural Gas ETF','commodity','commodity',TRUE,TRUE,NULL),
  ('DBC','Broad Commodity ETF','commodity','commodity',TRUE,TRUE,NULL),
  ('CORN','Corn ETF','commodity','commodity',TRUE,TRUE,NULL),
  ('SOYB','Soybean ETF','commodity','commodity',TRUE,TRUE,NULL),
  ('WEAT','Wheat ETF','commodity','commodity',TRUE,TRUE,NULL),
  ('BTCUSDT','Bitcoin','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('ETHUSDT','Ethereum','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('SOLUSDT','Solana','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('BNBUSDT','BNB','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('XRPUSDT','XRP','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('ADAUSDT','Cardano','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('DOGEUSDT','Dogecoin','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('AVAXUSDT','Avalanche','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('DOTUSDT','Polkadot','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('LINKUSDT','Chainlink','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('LTCUSDT','Litecoin','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('MATICUSDT','Polygon','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('TRXUSDT','TRON','crypto','crypto',TRUE,TRUE,'BINANCE'),
  ('EUR_USD','EUR/USD','fx','fx',TRUE,TRUE,'OANDA'),
  ('GBP_USD','GBP/USD','fx','fx',TRUE,TRUE,'OANDA'),
  ('USD_JPY','USD/JPY','fx','fx',TRUE,TRUE,'OANDA'),
  ('USD_CHF','USD/CHF','fx','fx',TRUE,TRUE,'OANDA'),
  ('AUD_USD','AUD/USD','fx','fx',TRUE,TRUE,'OANDA'),
  ('USD_CAD','USD/CAD','fx','fx',TRUE,TRUE,'OANDA'),
  ('NZD_USD','NZD/USD','fx','fx',TRUE,TRUE,'OANDA'),
  ('EUR_JPY','EUR/JPY','fx','fx',TRUE,TRUE,'OANDA'),
  ('EUR_GBP','EUR/GBP','fx','fx',TRUE,TRUE,'OANDA'),
  ('GBP_JPY','GBP/JPY','fx','fx',TRUE,TRUE,'OANDA'),
  ('AUD_JPY','AUD/JPY','fx','fx',TRUE,TRUE,'OANDA'),
  ('USD_BRL','USD/BRL','fx','fx',TRUE,TRUE,'OANDA'),
  ('^MERV','S&P Merval (Argentina)','equity','equity',TRUE,TRUE,NULL)
ON CONFLICT (symbol) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  asset_type = EXCLUDED.asset_type,
  active = EXCLUDED.active,
  is_active = EXCLUDED.is_active,
  exchange = COALESCE(universe_symbols.exchange, EXCLUDED.exchange);
