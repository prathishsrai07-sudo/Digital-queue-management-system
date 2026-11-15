/**
 * main.jsx
 * --------
 * Application entry point.
 *
 * URL routing:
 *   /                → Patient Side  (App.jsx)
 *   /doctor          → Doctor/Clinic Portal  (doctor/DoctorApp.jsx)
 *   /doctor/*        → Doctor/Clinic Portal  (doctor/DoctorApp.jsx)
 *   /platform-admin  → Private Platform Admin System (admin/PlatformAdminPortal.jsx)
 *
 * All systems are completely independent and decoupled.
 * The Platform Administration System is strictly private with no links from public portals.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App                 from './App.jsx';
import DoctorApp           from './doctor/DoctorApp.jsx';
import PlatformAdminPortal from './admin/PlatformAdminPortal.jsx';

// Path-based application router
const pathname = window.location.pathname;
const isPlatformAdmin = pathname.startsWith('/platform-admin');
const isDoctor        = pathname.startsWith('/doctor');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isPlatformAdmin ? (
      <PlatformAdminPortal />
    ) : isDoctor ? (
      <DoctorApp />
    ) : (
      <App />
    )}
  </StrictMode>,
);
