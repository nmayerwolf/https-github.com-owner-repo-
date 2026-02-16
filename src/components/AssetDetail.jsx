import React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchCompanyOverview } from '../api/alphavantage';
import { fetchCompanyProfile } from '../api/finnhub';
import { calculateConfluence } from '../engine/confluence';
import { useApp } from '../store/AppContext';
import CategoryBadge from './common/CategoryBadge';
import SignalBadge from './common/SignalBadge';
import ConfluenceBar from './common/ConfluenceBar';
import Sparkline from './common/Sparkline';
import NewsSection from './NewsSection';
import { formatPct, formatUSD } from '../utils/format';

const Item = ({ label, value }) => (
  <div className="ind-cell">
    <div className="ind-label">{label}</div>
    <div className="ind-val mono">{value}</div>
  </div>
);

const computeStops = (price, atr, rsi) => {
  if (!price || !atr) return { stopLoss: null, takeProfit: null, multiplier: null };
  const multiplier = rsi > 60 ? 2 : rsi < 40 ? 2.5 : 2.2;
  return {
    stopLoss: price - atr * multiplier,
    takeProfit: price + atr * multiplier * 2.5,
    multiplier
  };
};

const formatLargeNumber = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return value || '-';
  return n.toLocaleString('en-US');
};

const AssetDetail = () => {
  const { symbol } = useParams();
  const { state, actions } = useApp();
  const [overview, setOverview] = useState(null);
  const [profile, setProfile] = useState(null);

  const asset = actions.getAssetBySymbol(symbol);

  useEffect(() => {
    if (!asset || asset.category !== 'equity') return;
    let mounted = true;

    Promise.all([fetchCompanyOverview(asset.symbol), fetchCompanyProfile(asset.symbol)]).then(([ov, pf]) => {
      if (!mounted) return;
      setOverview(ov);
      setProfile(pf);
    });

    return () => {
      mounted = false;
    };
  }, [asset]);

  const signal = useMemo(() => (asset ? calculateConfluence(asset, state.config) : { recommendation: 'HOLD', net: 0, points: [] }), [asset, state.config]);
  const levels = useMemo(() => computeStops(asset?.price, asset?.indicators?.atr, asset?.indicators?.rsi), [asset]);
  const sessionOpen = Number(asset?.candles?.o?.[asset?.candles?.o?.length - 1]);
  const sessionClose = Number(asset?.candles?.c?.[asset?.candles?.c?.length - 1]);

  if (!asset) {
    return (
      <div className="card">
        <p>No se encontró el activo.</p>
        <Link to="/markets">Volver a mercados</Link>
      </div>
    );
  }

  return (
    <div className="grid asset-detail-page">
      <section className="card">
        <div className="row">
          <div>
            <h2>
              {asset.symbol} <span className="muted">{asset.name}</span>
            </h2>
            <div className="row" style={{ justifyContent: 'flex-start', marginTop: 6 }}>
              <CategoryBadge category={asset.category} />
              <SignalBadge signal={signal.recommendation} />
            </div>
          </div>
          <Link to="/markets">Volver</Link>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <strong className="mono" style={{ fontSize: 22 }}>{formatUSD(asset.price)}</strong>
          <strong className={`mono ${asset.changePercent >= 0 ? 'up' : 'down'}`}>{formatPct(asset.changePercent)}</strong>
        </div>
        <Sparkline values={asset.candles?.c?.slice(-60) || []} color={asset.changePercent >= 0 ? '#00E08E' : '#FF4757'} height={56} />
      </section>

      <section className="ind-grid">
        <Item label="RSI" value={asset.indicators?.rsi?.toFixed(2) ?? '-'} />
        <Item label="MACD Hist" value={asset.indicators?.macd?.histogram?.toFixed(4) ?? '-'} />
        <Item label="ATR" value={asset.indicators?.atr?.toFixed(4) ?? '-'} />
        <Item label="SMA50" value={asset.indicators?.sma50?.toFixed(2) ?? '-'} />
        <Item label="SMA200" value={asset.indicators?.sma200?.toFixed(2) ?? '-'} />
        <Item label="Vol Ratio" value={asset.indicators?.volumeRatio?.toFixed(2) ?? '-'} />
        <Item label="Bollinger Upper" value={asset.indicators?.bollinger?.upper?.toFixed(2) ?? '-'} />
        <Item label="Bollinger Lower" value={asset.indicators?.bollinger?.lower?.toFixed(2) ?? '-'} />
      </section>

      <section className="card">
        <h3>Confluencia & Señales</h3>
        <ConfluenceBar net={signal.net} />
        <div className="grid" style={{ marginTop: 8 }}>
          {(signal.points || []).map((p, idx) => (
            <div key={`${p}-${idx}`} className="muted">
              - {p}
            </div>
          ))}
          {!(signal.points || []).length && <div className="muted">Sin señales suficientes</div>}
        </div>
      </section>

      <section className="card">
        <h3>Niveles ATR adaptativos</h3>
        <div className="ind-grid" style={{ marginTop: 8 }}>
          <Item label="Stop Loss" value={formatUSD(levels.stopLoss)} />
          <Item label="Take Profit" value={formatUSD(levels.takeProfit)} />
          <Item label="Multiplicador ATR" value={levels.multiplier ?? '-'} />
          <Item label="Risk/Reward" value="1:2.5" />
        </div>
      </section>

      <section className="card">
        <h3>Fundamentales</h3>
        <div className="ind-grid" style={{ marginTop: 8 }}>
          <Item label="Apertura" value={formatUSD(Number.isFinite(sessionOpen) ? sessionOpen : null)} />
          <Item label="Cierre" value={formatUSD(Number.isFinite(sessionClose) ? sessionClose : null)} />
          <Item label="P/E" value={overview?.PERatio || '-'} />
          <Item label="Dividend Yield" value={overview?.DividendYield || '-'} />
          <Item label="Market Cap" value={formatLargeNumber(overview?.MarketCapitalization || profile?.marketCapitalization || '-')} />
          <Item label="Sector" value={overview?.Sector || profile?.finnhubIndustry || asset.sector} />
        </div>
      </section>

      <NewsSection title={`Noticias: ${asset.symbol}`} symbol={asset.symbol} limit={8} />
    </div>
  );
};

export default AssetDetail;
