import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import {
  LayoutDashboard, Server, Lightbulb, Cloud,
  BarChart3, Bell, LogOut, Zap
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { alertsApi } from '../services/api.js'

const NAV = [
  { to: '/dashboard',       icon: LayoutDashboard, label: 'Dashboard'       },
  { to: '/resources',       icon: Server,          label: 'Resources'       },
  { to: '/recommendations', icon: Lightbulb,       label: 'Recommendations' },
  { to: '/cost-report',     icon: BarChart3,        label: 'Cost Report'     },
  { to: '/accounts',        icon: Cloud,           label: 'Accounts'        },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    alertsApi.list()
      .then(r => setUnread(r.data.alerts?.filter(a => !a.isRead).length || 0))
      .catch(() => {})
  }, [])

  const handleLogout = () => { logout(); navigate('/login') }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem 0'
      }}>
        {/* Logo */}
        <div style={{ padding: '0 1.5rem 2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              background: 'var(--accent)',
              borderRadius: 8,
              padding: 6,
              display: 'flex'
            }}>
              <Zap size={16} color="#020817" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                CloudOpt
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em', marginTop: 2 }}>
                COST OPTIMIZER
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '0 0.75rem' }}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 12px',
              borderRadius: 8,
              marginBottom: 2,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              background: isActive ? 'var(--accent-glow)' : 'transparent',
              transition: 'all .15s'
            })}>
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 28, height: 28,
              background: 'linear-gradient(135deg, var(--accent), #3b82f6)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 800, color: '#020817', flexShrink: 0
            }}>
              {(user?.fullName || user?.email || 'U')[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.fullName || user?.email}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                {user?.role}
              </div>
            </div>
          </div>
          <button className="btn-secondary" onClick={handleLogout}
            style={{ width: '100%', display: 'flex', alignItems: 'center',
              gap: 6, justifyContent: 'center', padding: '7px 12px', fontSize: 12 }}>
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{
        flex: 1, overflow: 'auto',
        background: 'var(--bg-base)'
      }}>
        {/* Top bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'rgba(2,8,23,.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
          padding: '12px 2rem',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end'
        }}>
          <div style={{ position: 'relative' }}>
            <Bell size={18} color="var(--text-muted)" style={{ cursor: 'pointer' }} />
            {unread > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: '#ef4444', color: '#fff',
                fontSize: 9, fontWeight: 800,
                width: 14, height: 14, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                {unread}
              </span>
            )}
          </div>
        </div>

        {/* Page Content */}
        <div style={{ padding: '2rem' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
