import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './store/AuthContext';
import { AppProvider } from './store/AppContext';
import { ThemeProvider } from './store/ThemeContext';
import './styles.css';

class FatalBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, fontFamily: 'sans-serif', color: '#111', background: '#fff', minHeight: '100vh' }}>
          <h2>Horsai: error de arranque</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error?.message || this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

window.addEventListener('error', (event) => {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `<div style="padding:20px;font-family:sans-serif;background:#fff;color:#111;min-height:100vh"><h2>Horsai: error JS</h2><pre style="white-space:pre-wrap">${String(event?.error?.message || event?.message || 'Unknown error')}</pre></div>`;
});

window.addEventListener('unhandledrejection', (event) => {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = `<div style="padding:20px;font-family:sans-serif;background:#fff;color:#111;min-height:100vh"><h2>Horsai: promise rechazada</h2><pre style="white-space:pre-wrap">${String(event?.reason?.message || event?.reason || 'Unhandled rejection')}</pre></div>`;
});

createRoot(document.getElementById('root')).render(
  <FatalBoundary>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <AuthProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </FatalBoundary>
);
