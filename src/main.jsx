import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
import { AuthSessionProvider } from './lib/authSession.jsx';
import { ThemeProvider } from './lib/ThemeProvider.jsx';
import { installReleaseRecovery } from './lib/releaseRecovery.js';

installReleaseRecovery();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthSessionProvider>
          <App />
        </AuthSessionProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
