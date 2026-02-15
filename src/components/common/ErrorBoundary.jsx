import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMessage: String(error?.message || 'Error inesperado') };
  }

  componentDidCatch(_error, _info) {
    // Deliberately silent in UI; logging can be wired to external monitoring later.
  }

  reset = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    const { hasError, errorMessage } = this.state;
    const { moduleName = 'Módulo', children } = this.props;

    if (!hasError) return children;

    return (
      <section className="card" style={{ borderColor: '#FF4757AA' }}>
        <strong>Error en {moduleName}</strong>
        <div className="muted" style={{ marginTop: 6 }}>
          {errorMessage || 'Se produjo un error inesperado.'}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" onClick={this.reset}>
            Reintentar
          </button>
        </div>
      </section>
    );
  }
}

export default ErrorBoundary;
