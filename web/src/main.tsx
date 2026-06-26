import './polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { assetUrl } from './config';
import App from './App';
import './styles.css';

function manifestUrl(): string {
  if (typeof window !== 'undefined') {
    const base = import.meta.env.BASE_URL;
    const origin = window.location.origin.toLowerCase();
    return `${origin}${base}tonconnect-manifest.json`;
  }
  return assetUrl('tonconnect-manifest.json');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl()}>
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
);
