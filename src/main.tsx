import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { LegalGate } from './ui/LegalGate';
import { initAnalytics } from './lib/analytics';
import './app.css';

initAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <LegalGate>
        <App />
      </LegalGate>
    </AuthProvider>
  </React.StrictMode>,
);
