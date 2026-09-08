// src/hooks/useAuth.js
import { createContext, useContext, useState, useEffect } from 'react'
import { authApi } from '../services/api'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('cco_token')
    if (!token) { setLoading(false); return }
    authApi.me()
      .then(r => setUser(r.data))
      .catch(() => localStorage.removeItem('cco_token'))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email, password) => {
    const { data } = await authApi.login(email, password)
    localStorage.setItem('cco_token', data.token)
    setUser(data.user)
    return data
  }

  const logout = () => {
    localStorage.removeItem('cco_token')
    setUser(null)
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)
