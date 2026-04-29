import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function Login() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    console.log('URL:', window.location.href)
    console.log('Token:', token)
    if (token) {
      localStorage.setItem('token', token)
      navigate('/book')
    }
  }, [navigate])

  return (
    <div style={s.root}>
      <div style={s.left}>
        <div style={s.leftInner}>
          <div style={s.logoMark} />
          <h1 style={s.brand}>KU Zoom Booking</h1>
          <p style={s.tagline}>ระบบจองห้องประชุม Zoom<br />มหาวิทยาลัยเกษตรศาสตร์</p>
        </div>
      </div>
      <div style={s.right}>
        <div style={s.card}>
          <h2 style={s.heading}>เข้าสู่ระบบ</h2>
          <p style={s.desc}>ใช้บัญชี Google ของมหาวิทยาลัย<br />(@ku.th) เพื่อเข้าใช้งาน</p>
          <button
            style={s.btn}
            onClick={() => window.location.href = 'http://localhost:3000/auth/google'}
            onMouseEnter={e => e.target.style.background = '#1a5c2e'}
            onMouseLeave={e => e.target.style.background = '#2d7a3e'}
          >
            Sign in with Google
          </button>
          <p style={s.note}>* เฉพาะบัญชี @ku.th เท่านั้น</p>
        </div>
      </div>
    </div>
  )
}

const s = {
  root: { display: 'flex', height: '100vh', fontFamily: "'Sarabun', sans-serif" },
  left: {
    width: '45%', background: '#2d7a3e',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  leftInner: { padding: 48, color: 'white' },
  logoMark: {
    width: 56, height: 56, borderRadius: 14,
    background: 'rgba(255,255,255,0.2)', marginBottom: 32,
    border: '2px solid rgba(255,255,255,0.4)'
  },
  brand: { fontSize: 32, fontWeight: 700, margin: '0 0 12px', letterSpacing: '-0.5px' },
  tagline: { fontSize: 16, lineHeight: 1.7, opacity: 0.85, margin: 0 },
  right: {
    flex: 1, background: '#f7f9f7',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  },
  card: {
    background: 'white', borderRadius: 16, padding: '48px 40px',
    width: 360, boxShadow: '0 2px 16px rgba(0,0,0,0.07)'
  },
  heading: { fontSize: 24, fontWeight: 700, color: '#1a1a1a', margin: '0 0 8px' },
  desc: { fontSize: 14, color: '#666', lineHeight: 1.7, margin: '0 0 32px' },
  btn: {
    width: '100%', padding: '13px 0', background: '#2d7a3e',
    color: 'white', border: 'none', borderRadius: 8, fontSize: 15,
    fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s',
    fontFamily: "'Sarabun', sans-serif"
  },
  note: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 16 }
}

export default Login