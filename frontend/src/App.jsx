import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import api from './api'
import Login from './pages/login'
import Book from './pages/book'
import MyBookings from './pages/my-bookings'
import Calendar from './pages/calendar'
import Join from './pages/join'
import Admin from './pages/admin'
import PrivacyNotice from './components/PrivacyNotice'

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
    // guest ก็เข้าหน้าปฏิทินได้ — จะถูกพาไปหน้าเข้าสู่ระบบเมื่อกดจอง
    navigate('/calendar', { replace: true })
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
        // เก็บ id_token ไว้ใช้เป็น id_token_hint ตอน logout SSO
        if (res.data.idToken) localStorage.setItem('ku_id_token', res.data.idToken)
        // ขั้นที่ 2 ขึ้นมาเอง: ยังไม่เคยเชื่อม Google → ไปหน้า Google ต่อทันที
        // googleLinkUrl มีตั๋วเชื่อมบัญชีจาก backend (บังคับบัญชี @ku.th อีเมลเดียวกัน)
        // เคยเชื่อมแล้ว → เข้าใช้งานได้เลย · reload เต็ม (clean URL) เพราะ navigate path เดิมไม่ remount
        window.location.replace(res.data.hasCalendar ? '/calendar' : res.data.googleLinkUrl)
      })
      // ส่งต่อ error code จาก backend (invalid_state / ku_domain / kulogin_failed)
      // เพื่อให้หน้า login บอกสาเหตุได้ตรง ไม่ใช่ข้อความรวมอันเดียว
      .catch(err => {
        const code = err.response?.data?.error || 'kulogin'
        navigate(`/login?error=${encodeURIComponent(code)}`, { replace: true })
      })
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

// ดัก OAuth callback (?code=) ก่อนแสดงปฏิทิน
// ปฏิทินเปิดให้ guest ดูได้ ไม่ต้องผ่าน PrivateRoute
function CalendarRoute() {
  const params = new URLSearchParams(window.location.search)
  if (params.has('code') && params.has('state')) return <KuLoginExchange />
  return <Calendar />
}

// ปลายทางหลัง logout จาก KU ALL-Login (post_logout_redirect_uri ที่ลงทะเบียน = /logout)
// clear token แล้วเด้งไปหน้า login เลย → พร้อม login ใหม่ทันที
function Logout() {
  const navigate = useNavigate()
  useEffect(() => {
    localStorage.removeItem('token')
    localStorage.removeItem('ku_id_token')
    navigate('/login', { replace: true })
  }, [navigate])
  return null
}

function App() {
  return (
    <>
    <PrivacyNotice />
    <Routes>
      <Route path="/" element={<TokenHandler />} />
      <Route path="/login" element={<Login />} />
      <Route path="/logout" element={<Logout />} />
      <Route path="/calendar" element={<CalendarRoute />} />
      <Route path="/book" element={<PrivateRoute><Book /></PrivateRoute>} />
      <Route path="/my-bookings" element={<PrivateRoute><MyBookings /></PrivateRoute>} />
      <Route path="/join/:id" element={<PrivateRoute><Join /></PrivateRoute>} />
      <Route path="/admin" element={<PrivateRoute><Admin /></PrivateRoute>} />
    </Routes>
    </>
  )
}

export default App
