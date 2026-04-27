import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/login'
import Book from './pages/book'
import MyBookings from './pages/my-bookings'

function App() {
  const token = localStorage.getItem('token')

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/book" element={token ? <Book /> : <Navigate to="/login" />} />
      <Route path="/my-bookings" element={token ? <MyBookings /> : <Navigate to="/login" />} />
      <Route path="/" element={<Navigate to={token ? "/book" : "/login"} />} />
    </Routes>
  )
}

export default App