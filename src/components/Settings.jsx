import { useState } from 'react';
import { useApp } from '../store/AppContext';

const Settings = () => {
  const { state, actions } = useApp();
  const [local, setLocal] = useState(state.config);

  return (
    <div className="card">
      <h2>Configuración</h2>
      <div className="grid grid-2" style={{ marginTop: 8 }}>
        <label className="label">
          <span className="muted">Perfil de riesgo</span>
          <select value={local.riskProfile} onChange={(e) => setLocal({ ...local, riskProfile: e.target.value })}>
            <option value="conservador">conservador</option>
            <option value="moderado">moderado</option>
            <option value="agresivo">agresivo</option>
          </select>
        </label>
        <label className="label">
          <span className="muted">Horizonte</span>
          <select value={local.horizon} onChange={(e) => setLocal({ ...local, horizon: e.target.value })}>
            <option value="corto">corto</option>
            <option value="mediano">mediano</option>
            <option value="largo">largo</option>
          </select>
        </label>
        <label className="label">
          <span className="muted">RSI sobreventa</span>
          <input type="number" value={local.rsiOS} min={15} max={40} onChange={(e) => setLocal({ ...local, rsiOS: Number(e.target.value) })} />
        </label>
        <label className="label">
          <span className="muted">RSI sobrecompra</span>
          <input type="number" value={local.rsiOB} min={60} max={85} onChange={(e) => setLocal({ ...local, rsiOB: Number(e.target.value) })} />
        </label>
        <label className="label">
          <span className="muted">Volumen anómalo (x)</span>
          <input type="number" step="0.1" value={local.volThresh} min={1.2} max={4} onChange={(e) => setLocal({ ...local, volThresh: Number(e.target.value) })} />
        </label>
        <label className="label">
          <span className="muted">Confluencia mínima</span>
          <input type="number" value={local.minConfluence} min={1} max={5} onChange={(e) => setLocal({ ...local, minConfluence: Number(e.target.value) })} />
        </label>
      </div>
      <button type="button" onClick={() => actions.setConfig(local)}>
        Guardar y aplicar
      </button>
    </div>
  );
};

export default Settings;
