import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import App from './App';
import CitizenPortal from './pages/CitizenPortal';
import GovernmentAdminPortal from './pages/GovernmentAdminPortal';
import TaxCollectorPortal from './pages/TaxCollectorPortal';
import EmployerPortal from './pages/EmployerPortal';
import TransparencyExplorer from './pages/TransparencyExplorer';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/citizen" element={<CitizenPortal />} />
        <Route path="/admin" element={<GovernmentAdminPortal />} />
        <Route path="/tax-collector" element={<TaxCollectorPortal />} />
        <Route path="/employer" element={<EmployerPortal />} />
        <Route path="/transparency" element={<TransparencyExplorer />} />
      </Routes>
    </Router>
  </React.StrictMode>
);