import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import Login from './pages/login'
import Book from './pages/book'
import MyBookings from './pages/my-bookings'
import Calendar from './pages/calendar'

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

function App() {
  return (
    <Routes>
      <Route path="/" element={<TokenHandler />} />
      <Route path="/login" element={<Login />} />
      <Route path="/calendar" element={<PrivateRoute><Calendar /></PrivateRoute>} />
      <Route path="/book" element={<PrivateRoute><Book /></PrivateRoute>} />
      <Route path="/my-bookings" element={<PrivateRoute><MyBookings /></PrivateRoute>} />
    </Routes>
  )
}

export default App
