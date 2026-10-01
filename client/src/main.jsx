import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import Display from './pages/Display.jsx';
import Login from './pages/Login.jsx';
import Admin from './pages/Admin.jsx';
import Punch from './pages/Punch.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Display />} />
        <Route path="/display/:code" element={<Display />} />
        <Route path="/punch/:code" element={<Punch />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/*" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
