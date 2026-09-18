import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { store }  from './app/store';
import { router } from './router/index.jsx';
import { LocaleProvider } from './contexts/LocaleContext';
import { ConnectivityProvider } from './contexts/ConnectivityContext';
import { ThemeProvider } from './contexts/ThemeContext';
import UpdateBanner from './components/UpdateBanner';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <LocaleProvider>
          <ConnectivityProvider>
            <RouterProvider router={router} />
            <UpdateBanner />
          </ConnectivityProvider>
        </LocaleProvider>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>
);
