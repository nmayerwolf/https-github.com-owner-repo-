import React from 'react';
import { Link } from 'react-router-dom';
import Sparkline from './Sparkline';
import { formatPct, formatUSD } from '../../utils/format';

const iconClassByCategory = (category) => {
  const key = String(category || '').toLowerCase();
  if (key === 'crypto') return 'cr';
  if (key === 'metal') return 'mt';
  if (key === 'fx') return 'fx';
  if (key === 'bond') return 'bd';
  if (key === 'commodity') return 'cm';
  return 'eq';
};

const AssetRow = ({ asset, to = null, action = null, actionLabel = null }) => {
  if (!asset) return null;
  const up = Number(asset.changePercent || 0) >= 0;
  const content = (
    <>
      <div className={`a-icon ${iconClassByCategory(asset.category)}`}>{String(asset.symbol || '').slice(0, 3)}</div>
      <div className="a-info">
        <div className="a-sym">{asset.symbol}</div>
        <div className="a-name">{asset.name}</div>
      </div>
      <div className="a-spark">
        <Sparkline values={asset.candles?.c?.slice(-30) || []} color={up ? '#00DC82' : '#FF4757'} />
      </div>
      <div className="a-price-col">
        <div className="a-price mono">{formatUSD(asset.price)}</div>
        <div className={`a-chg mono ${up ? 'up' : 'down'}`}>{formatPct(asset.changePercent)}</div>
      </div>
    </>
  );

  return (
    <article className="asset-row">
      {to ? (
        <Link to={to} className="asset-row-main">
          {content}
        </Link>
      ) : (
        <div className="asset-row-main">{content}</div>
      )}
      {action && actionLabel ? (
        <button type="button" className="asset-row-action" onClick={action}>
          {actionLabel}
        </button>
      ) : null}
    </article>
  );
};

export default AssetRow;
