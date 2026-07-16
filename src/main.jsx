import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App.jsx';
import './index.css';
import { AuthSessionProvider } from './lib/authSession.jsx';
import { ThemeProvider } from './lib/ThemeProvider.jsx';
import { installReleaseRecovery } from './lib/releaseRecovery.js';

installReleaseRecovery();

const router = createBrowserRouter([
  {
    path: '*',
    element: <App />,
  },
], {
  future: { v7_startTransition: true, v7_relativeSplatPath: true },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthSessionProvider>
        <RouterProvider router={router} />
      </AuthSessionProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
