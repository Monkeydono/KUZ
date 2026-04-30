import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Login from './pages/login'
import Book from './pages/book'
import MyBookings from './pages/my-bookings'
import Calendar from './pages/calendar'

function TokenHandler() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const tokenFromUrl = searchParams.get('token')
    if (tokenFromUrl) {
      localStorage.setItem('token', tokenFromUrl)
      navigate('/calendar', { replace: true })
      return
    }
    const existingToken = localStorage.getItem('token')
    navigate(existingToken ? '/calendar' : '/login', { replace: true })
  }, [])

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
