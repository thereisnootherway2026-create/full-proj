import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAppContext } from './context/AppContext'
import ProtectedRoute from './components/common/ProtectedRoute'
import RoleGuard from './components/common/RoleGuard'
import DashboardLayout from './layouts/DashboardLayout'

// Pages
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import VerificationPage from './pages/VerificationPage'
import SecretaryWelcomePage from './pages/SecretaryWelcomePage'
import DashboardPage from './pages/DashboardPage' // The restored "Tableau de bord"
import SecretaryOnboardingGate from './components/common/SecretaryOnboardingGate'
import AiScribePage from './pages/AiScribePage'

// Shared Dashboard Components (Using the .jsx production versions)
import AppointmentsPage from './pages/dashboard/AppointmentsPage'
import BillingPage from './pages/dashboard/BillingPage'
import PatientsPage from './pages/dashboard/PatientsPage'
import SettingsPage from './pages/dashboard/SettingsPage'
import ConsultationWorkspace from './pages/dashboard/ConsultationWorkspace'
import DossierPatient from './pages/dashboard/DossierPatient'
import PatientWorkspace from './pages/dashboard/PatientWorkspace'
import TasksPage from './pages/dashboard/TasksPage'

function RootRedirect() {
  const { isAuthenticated, isInitializing } = useAppContext()
  if (isInitializing) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="text-slate-400 font-bold animate-pulse">Chargement de MacroMedica...</div>
      </div>
    )
  }
  if (!isAuthenticated) return <LandingPage />

  // Direct to unified dashboard entry point
  return <Navigate to="/dashboard" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verification" element={<VerificationPage />} />
        <Route path="/bienvenue-secretaire" element={<SecretaryWelcomePage />} />

        {/* Protected Dashboard Routes */}
        <Route element={<ProtectedRoute />}>
          <Route element={<SecretaryOnboardingGate />}>
          <Route element={<DashboardLayout />}>
          
          {/* 1. Tableau de bord (Restored Statistics/Overview Dashboard) */}
          <Route path="/dashboard" element={<DashboardPage />} />
          
          {/* 2. Agenda (RDV) */}
          <Route path="/agenda" element={<AppointmentsPage />} />

          {/* 3. Patients (Registry + Profile V2) */}
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/patients/:id" element={<PatientsPage />} />
          <Route path="/dossier-patient" element={<DossierPatient />} />
          <Route path="/patient-workspace/:id" element={<PatientWorkspace />} />

          {/* 4. Facturation — secretary encaisse; doctor may view queue */}
          <Route
            path="/facturation"
            element={
              <RoleGuard roles={['secretaire', 'secrétaire', 'secretary', 'docteur', 'medecin', 'doctor', 'admin']}>
                <BillingPage />
              </RoleGuard>
            }
          />
          <Route
            path="/facturation/:id"
            element={
              <RoleGuard roles={['secretaire', 'secrétaire', 'secretary', 'docteur', 'medecin', 'doctor', 'admin']}>
                <BillingPage />
              </RoleGuard>
            }
          />

          {/* 5. AI Assistant / Ai Scribe */}
          <Route
            path="/ai-scribe"
            element={
              <RoleGuard roles={['secretaire', 'secrétaire', 'secretary', 'docteur', 'medecin', 'doctor', 'admin']}>
                <AiScribePage />
              </RoleGuard>
            }
          />

          {/* 6. Tâches */}
          <Route
            path="/taches"
            element={<TasksPage />}
          />

          {/* 7. Paramètres */}
          <Route
            path="/parametres"
            element={<SettingsPage />}
          />

          {/* Hidden/Helper Routes */}
          <Route
            path="/consultation/:visitId"
            element={
              <RoleGuard roles={['docteur', 'medecin', 'doctor', 'admin']}>
                <ConsultationWorkspace />
              </RoleGuard>
            }
          />

          {/* Fallback for old /secretaire route */}
          <Route path="/secretaire" element={<Navigate to="/dashboard" replace />} />
          </Route>
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
