import React from 'react';
import ConfluenceBar from './ConfluenceBar';
import { formatUSD } from '../../utils/format';

const labelByType = {
  compra: 'Strong Buy',
  venta: 'Sell',
  stoploss: 'Stop Loss',
  opportunity: 'Strong Buy',
  bearish: 'Sell',
  stop_loss: 'Stop Loss'
};

const toneByType = {
  compra: 'buy',
  venta: 'sell',
  stoploss: 'warning',
  opportunity: 'buy',
  bearish: 'sell',
  stop_loss: 'warning'
};

const AlertCard = ({ alert }) => {
  if (!alert) return null;
  const tone = toneByType[String(alert.type || '').toLowerCase()] || 'hold';
  const label = labelByType[String(alert.type || '').toLowerCase()] || 'Señal';
  const net = Number(alert.net ?? alert.confluenceBull ?? 0) - Number(alert.confluenceBear ?? 0);

  return (
    <article className={`alert-card ${tone}`}>
      <div className="alert-top">
        <span className="alert-symbol mono">{alert.symbol || 'N/A'}</span>
        <span className={`badge ${tone}`}>{label}</span>
      </div>
      <div className="alert-body">{alert.title || alert.recommendation || 'Nueva señal del agente.'}</div>
      <ConfluenceBar net={Number.isFinite(net) ? net : 0} />
      <div className="alert-meta">
        <span className="mono">
          {alert.stopLoss ? `SL ${formatUSD(alert.stopLoss)}` : '-'} {alert.takeProfit ? `→ TP ${formatUSD(alert.takeProfit)}` : ''}
        </span>
        <span className="mono">{String(alert.confidence || 'high')}</span>
      </div>
    </article>
  );
};

export default AlertCard;
