import React, { memo } from 'react';
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
      <div className="asset-left">
        <div className={`a-icon ${iconClassByCategory(asset.category)}`}>{String(asset.symbol || '').slice(0, 3)}</div>
        <div className="a-info">
          <div className="a-sym">{asset.symbol}</div>
          <div className="a-name">{asset.name}</div>
          {asset?.marketMeta?.unavailable ? <div className="a-stale">Sin dato en tiempo real</div> : null}
          {!asset?.marketMeta?.unavailable && asset?.marketMeta?.stale ? <div className="a-stale">Dato desactualizado</div> : null}
          <div className="a-mini-chart" aria-hidden="true">
            <Sparkline values={asset.candles?.c?.slice(-30) || []} color={up ? '#00DC82' : '#FF4757'} height={20} />
          </div>
        </div>
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

const areEqualAssetRow = (prevProps, nextProps) => {
  const prev = prevProps.asset;
  const next = nextProps.asset;
  if (prev === next) {
    return prevProps.to === nextProps.to && prevProps.action === nextProps.action && prevProps.actionLabel === nextProps.actionLabel;
  }
  if (!prev || !next) return false;
  const prevSpark = prev.candles?.c || [];
  const nextSpark = next.candles?.c || [];
  const prevSparkTail = prevSpark.slice(-30).join(',');
  const nextSparkTail = nextSpark.slice(-30).join(',');
  return (
    prev.symbol === next.symbol &&
    prev.name === next.name &&
    prev.category === next.category &&
    prev.price === next.price &&
    prev.changePercent === next.changePercent &&
    prevSparkTail === nextSparkTail &&
    prevProps.to === nextProps.to &&
    prevProps.actionLabel === nextProps.actionLabel &&
    prevProps.action === nextProps.action
  );
};

export default memo(AssetRow, areEqualAssetRow);
