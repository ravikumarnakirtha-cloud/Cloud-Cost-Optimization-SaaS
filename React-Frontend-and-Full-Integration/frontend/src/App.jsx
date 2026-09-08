import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import Layout       from './components/Layout.jsx'
import LoginPage    from './pages/LoginPage.jsx'
import Dashboard    from './pages/Dashboard.jsx'
import ResourcesPage from './pages/ResourcesPage.jsx'
import RecommendationsPage from './pages/RecommendationsPage.jsx'
import AccountsPage from './pages/AccountsPage.jsx'
import CostReportPage from './pages/CostReportPage.jsx'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={
        <Protected>
          <Layout />
        </Protected>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"        element={<Dashboard />} />
        <Route path="resources"        element={<ResourcesPage />} />
        <Route path="recommendations"  element={<RecommendationsPage />} />
        <Route path="accounts"         element={<AccountsPage />} />
        <Route path="cost-report"      element={<CostReportPage />} />
      </Route>
    </Routes>
  )
}
