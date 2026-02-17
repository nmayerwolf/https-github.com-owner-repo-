import React, { memo } from 'react';
import ConfluenceBar from './ConfluenceBar';
import { formatUSD } from '../../utils/format';

const labelByType = {
  compra: 'Compra fuerte',
  venta: 'Venta',
  stoploss: 'Stop loss',
  takeprofit: 'Take profit',
  opportunity: 'Compra fuerte',
  bearish: 'Venta',
  stop_loss: 'Stop loss'
};

const toneByType = {
  compra: 'buy',
  venta: 'sell',
  stoploss: 'warning',
  takeprofit: 'sell',
  opportunity: 'buy',
  bearish: 'sell',
  stop_loss: 'warning'
};

const AlertCard = ({ alert, onClick = null }) => {
  if (!alert) return null;
  const tone = toneByType[String(alert.type || '').toLowerCase()] || 'hold';
  const label = labelByType[String(alert.type || '').toLowerCase()] || 'Señal';
  const net = Number(alert.net ?? alert.confluenceBull ?? 0) - Number(alert.confluenceBear ?? 0);

  return (
    <article
      className={`alert-card ${tone} ${onClick ? 'alert-card-clickable' : ''}`}
      onClick={onClick || undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="alert-top">
        <span className="alert-symbol mono">{alert.symbol || 'N/A'}</span>
        <span className={`badge ${tone}`}>{label}</span>
      </div>
      <div className="alert-body">{alert.title || alert.recommendation || 'Nueva señal del agente.'}</div>
      <ConfluenceBar net={Number.isFinite(net) ? net : 0} />
      <div className="alert-meta">
        <span className="mono">{alert.stopLoss ? `SL ${formatUSD(alert.stopLoss)}` : 'SL -'}</span>
        <span className="mono">{alert.takeProfit ? `TP ${formatUSD(alert.takeProfit)}` : 'TP -'}</span>
        <span className="mono">{String(alert.confidence || 'high')}</span>
      </div>
    </article>
  );
};

const areEqualAlertCard = (prevProps, nextProps) => {
  const prev = prevProps.alert;
  const next = nextProps.alert;
  if (prev === next) return true;
  if (!prev || !next) return false;
  return (
    prev.id === next.id &&
    prev.type === next.type &&
    prev.symbol === next.symbol &&
    prev.title === next.title &&
    prev.recommendation === next.recommendation &&
    prev.stopLoss === next.stopLoss &&
    prev.takeProfit === next.takeProfit &&
    prev.confidence === next.confidence &&
    prev.net === next.net &&
    prev.confluenceBull === next.confluenceBull &&
    prev.confluenceBear === next.confluenceBear &&
    prevProps.onClick === nextProps.onClick
  );
};

export default memo(AlertCard, areEqualAlertCard);
