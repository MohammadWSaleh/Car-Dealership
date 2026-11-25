import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './i18n/index.js';
import './index.css';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { CompareProvider } from './components/compare.jsx';
import { ToastProvider } from './components/ui.jsx';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 10_000 } } });
createRoot(document.getElementById('root')).render(
  <React.StrictMode><QueryClientProvider client={qc}><BrowserRouter><AuthProvider><ToastProvider><CompareProvider><App /></CompareProvider></ToastProvider></AuthProvider></BrowserRouter></QueryClientProvider></React.StrictMode>);
