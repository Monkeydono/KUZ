import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import api from './api'
import Login from './pages/login'
import Book from './pages/book'
import MyBookings from './pages/my-bookings'
import Calendar from './pages/calendar'
import Join from './pages/join'
import Admin from './pages/admin'

// อ่าน token จาก URL fragment (#token=...) ไม่ใช่ query string
// fragment ไม่ติด server log / Referer header
function readTokenFromHash() {
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  return params.get('token')
}

function TokenHandler() {
  const navigate = useNavigate()

  useEffect(() => {
    const tokenFromHash = readTokenFromHash()
    if (tokenFromHash) {
      localStorage.setItem('token', tokenFromHash)
      window.history.replaceState(null, '', window.location.pathname)
      navigate('/calendar', { replace: true })
      return
    }
    const existingToken = localStorage.getItem('token')
    navigate(existingToken ? '/calendar' : '/login', { replace: true })
  }, [navigate])

  return null
}

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
}

// KU ALL-Login redirect กลับมาที่ /calendar?code=...&state=... (user ยังไม่มี token)
// แลก code เป็น JWT ที่ backend แล้วเก็บ token
function KuLoginExchange() {
  const navigate = useNavigate()
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const code = q.get('code')
    const state = q.get('state')
    if (!code || !state) { navigate('/login', { replace: true }); return }
    api.post('/auth/kulogin/exchange', { code, state })
      .then(res => {
        localStorage.setItem('token', res.data.token)
        // reload เต็มไปที่ /calendar (clean URL) — navigate path เดิมไม่ remount CalendarRoute
        window.location.replace('/calendar')
      })
      .catch(() => navigate('/login?error=kulogin', { replace: true }))
  }, [navigate])
  return (
    <div style={{
      display: 'flex', minHeight: '100vh', alignItems: 'center',
      justifyContent: 'center', color: '#028152', fontSize: 16,
    }}>
      กำลังเข้าสู่ระบบด้วย KU ALL-Login…
    </div>
  )
}

// ดัก OAuth callback (?code=) ก่อน PrivateRoute เด้งไป /login
function CalendarRoute() {
  const params = new URLSearchParams(window.location.search)
  if (params.has('code') && params.has('state')) return <KuLoginExchange />
  return <PrivateRoute><Calendar /></PrivateRoute>
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<TokenHandler />} />
      <Route path="/login" element={<Login />} />
      <Route path="/calendar" element={<CalendarRoute />} />
      <Route path="/book" element={<PrivateRoute><Book /></PrivateRoute>} />
      <Route path="/my-bookings" element={<PrivateRoute><MyBookings /></PrivateRoute>} />
      <Route path="/join/:id" element={<PrivateRoute><Join /></PrivateRoute>} />
      <Route path="/admin" element={<PrivateRoute><Admin /></PrivateRoute>} />
    </Routes>
  )
}

export default App
