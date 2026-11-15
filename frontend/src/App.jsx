import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ShellMenuProvider } from './context/ShellMenuContext';
import NavigationNavbar from './components/NavigationNavbar';
import RoleGate from './components/RoleGate';
import HomePage from './components/HomePage';
import PatientConsultation from './components/PatientConsultation';
import DoctorDesk from './components/DoctorDesk';
import AdminModule from './components/AdminModule';
import LobbyDisplayPage from './components/LobbyDisplayPage';
import ReceptionDisplayPage from './components/ReceptionDisplayPage';
import PrescriptionViewPage from './components/PrescriptionViewPage';
import KnowledgeBaseAndRoadmap from './components/KnowledgeBaseAndRoadmap';
import HowToUsePage from './components/HowToUsePage';
import SiteFooter from './components/SiteFooter';
import VolunteerPortal from './components/VolunteerPortal';
import CSRPortal from './components/CSRPortal';
import './App.css';

function AppLayout() {
  return (
    <div className="site-wrapper">
      <NavigationNavbar />
      <main className="main-content-area">
        <Routes>
          <Route path="/" element={<HomePage />} />

          <Route
            path="/patient"
            element={(
              <RoleGate allow={['patient']}>
                <PatientConsultation />
              </RoleGate>
            )}
          />

          <Route
            path="/doctor"
            element={(
              <RoleGate allow={['doctor', 'admin']}>
                <DoctorDesk />
              </RoleGate>
            )}
          />

          <Route
            path="/admin"
            element={(
              <RoleGate allow={['admin']}>
                <AdminModule />
              </RoleGate>
            )}
          />

          <Route
            path="/volunteer"
            element={(
              <RoleGate allow={['volunteer', 'admin']}>
                <VolunteerPortal />
              </RoleGate>
            )}
          />

          <Route
            path="/csr"
            element={(
              <RoleGate allow={['csr', 'admin']}>
                <CSRPortal />
              </RoleGate>
            )}
          />

          <Route path="/lobby-display" element={<LobbyDisplayPage />} />
          <Route path="/reception-display" element={<ReceptionDisplayPage />} />
          <Route path="/prescription/:prescription_id" element={<PrescriptionViewPage />} />
          <Route path="/knowledge-base" element={<KnowledgeBaseAndRoadmap />} />
          <Route path="/knowledge_base" element={<Navigate to="/knowledge-base" replace />} />
          <Route path="/how-to-use" element={<HowToUsePage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <SiteFooter />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ShellMenuProvider>
          <AppLayout />
        </ShellMenuProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
