import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './hooks/useAuth';
import { ShoppingCatalogProvider } from './context/ShoppingCatalogContext';
import { initAnalytics } from './lib/analytics';
import './app.css';

initAnalytics();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ShoppingCatalogProvider>
        <App />
      </ShoppingCatalogProvider>
    </AuthProvider>
  </React.StrictMode>,
);
