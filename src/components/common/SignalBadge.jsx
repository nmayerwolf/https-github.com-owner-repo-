const palette = {
  'STRONG BUY': '#00E08E',
  BUY: '#00E08E',
  HOLD: '#FBBF24',
  SELL: '#FF4757',
  'STRONG SELL': '#FF4757'
};

const SignalBadge = ({ signal }) => {
  const color = palette[signal] || '#6B7B8D';
  return (
    <span className="badge" style={{ background: `${color}22`, color }}>
      {signal}
    </span>
  );
};

export default SignalBadge;
