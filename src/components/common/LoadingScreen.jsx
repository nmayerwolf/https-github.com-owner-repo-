import React from 'react';

const LoadingScreen = ({ loaded, total }) => (
  <div className="center-screen">
    <div className="card" style={{ width: 320 }}>
      <h2>Cargando mercado...</h2>
      <p className="muted">
        Activos cargados: {loaded}/{total}
      </p>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${(loaded / (total || 1)) * 100}%` }} />
      </div>
    </div>
  </div>
);

export default LoadingScreen;
