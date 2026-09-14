import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
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
import ProductShowcase from './pages/ProductShowcase'

// Shared Dashboard Components (Using the .jsx production versions)
import AppointmentsPage from './pages/dashboard/AppointmentsPage'
import FacturationPage from './pages/dashboard/FacturationPage'
import PatientsPage from './pages/dashboard/PatientsPage'
import SettingsPage from './pages/dashboard/SettingsPage'
import ConsultationWorkspace from './pages/dashboard/ConsultationWorkspace'
import PatientWorkspace from './pages/dashboard/PatientWorkspace'
import DossierPatient from './pages/dashboard/DossierPatient'
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

const router = createBrowserRouter([
  // Public Routes
  { path: '/', element: <RootRedirect /> },
  { path: '/showcase', element: <ProductShowcase /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/verification', element: <VerificationPage /> },
  { path: '/bienvenue-secretaire', element: <SecretaryWelcomePage /> },

  // Protected Dashboard Routes
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <SecretaryOnboardingGate />,
        children: [
          {
            element: <DashboardLayout />,
            children: [
              // 1. Tableau de bord
              { path: '/dashboard', element: <DashboardPage /> },

              // 2. Agenda (RDV)
              { path: '/agenda', element: <AppointmentsPage /> },

              { path: '/patients', element: <PatientsPage /> },
              { path: '/patients/:id', element: <PatientsPage /> },
              {
                path: '/patient-workspace/:id',
                element: (
                  <RoleGuard role="docteur">
                    <PatientWorkspace />
                  </RoleGuard>
                ),
              },
              {
                path: '/patients/:id/dossier',
                element: (
                  <RoleGuard role="docteur">
                    <DossierPatient />
                  </RoleGuard>
                ),
              },

              // 4. Facturation
              {
                path: '/facturation',
                element: (
                  <RoleGuard roles={['secretaire', 'docteur', 'medecin', 'admin']}>
                    <FacturationPage />
                  </RoleGuard>
                ),
              },
              {
                path: '/facturation/:id',
                element: (
                  <RoleGuard roles={['secretaire', 'docteur', 'medecin', 'admin']}>
                    <FacturationPage />
                  </RoleGuard>
                ),
              },

              // 5. AI Assistant / Ai Scribe
              {
                path: '/ai-scribe',
                element: (
                  <RoleGuard role="docteur">
                    <AiScribePage />
                  </RoleGuard>
                ),
              },

              // 6. Tâches
              { path: '/taches', element: <TasksPage /> },

              // 7. Paramètres
              { path: '/parametres', element: <SettingsPage /> },

              // Hidden/Helper Routes
              {
                path: '/consultation/:visitId',
                element: (
                  <RoleGuard role="docteur">
                    <ConsultationWorkspace />
                  </RoleGuard>
                ),
              },

              // Fallback for old /secretaire route
              { path: '/secretaire', element: <Navigate to="/dashboard" replace /> },
            ],
          },
        ],
      },
    ],
  },

  // Global Fallback
  { path: '*', element: <Navigate to="/" replace /> },
])

export default function App() {
  return <RouterProvider router={router} />
}
