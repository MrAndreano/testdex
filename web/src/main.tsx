import './polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import App from './App';
import './styles.css';

function manifestUrl(): string {
  return new URL(`${import.meta.env.BASE_URL}tonconnect-manifest.json`, window.location.origin).href;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TonConnectUIProvider manifestUrl={manifestUrl()}>
      <App />
    </TonConnectUIProvider>
  </StrictMode>,
);
