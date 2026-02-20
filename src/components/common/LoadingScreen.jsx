import React from 'react';
import HorsaiHorseIcon from './HorsaiHorseIcon';

const LoadingScreen = () => (
  <div className="center-screen">
    <div className="loading-screen-shell" aria-label="Cargando Horsai">
      <HorsaiHorseIcon className="loading-logo-spin" />
    </div>
  </div>
);

export default LoadingScreen;
