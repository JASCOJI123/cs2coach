import React from 'react';
import ReactDOM from 'react-dom/client';
import { initTelegram } from './lib/telegram';
import App from './App';
import './styles.css';

initTelegram();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);