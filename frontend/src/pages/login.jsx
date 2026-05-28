import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import KUEmblem from '../components/KUEmblem'
import { useIsMobile } from '../useIsMobile'

function Login() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [error, setError] = useState('')

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (hash) {
      const params = new URLSearchParams(hash)
      const token = params.get('token')
      if (token) {
        localStorage.setItem('token', token)
        window.history.replaceState(null, '', window.location.pathname)
        navigate('/calendar')
        return
      }
    }
    const query = new URLSearchParams(window.location.search)
    if (query.get('error') === 'domain') {
      setError('อีเมลนี้เข้าใช้งานไม่ได้ — กรุณาใช้บัญชี Google ของมหาวิทยาลัย (@ku.th หรือ @ku.ac.th) เท่านั้น')
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [navigate])

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000'

  return (
    <div style={{ ...s.root, flexDirection: isMobile ? 'column' : 'row' }}>
      <div style={s.bgPattern} />

      <div style={{ ...s.left, width: isMobile ? '100%' : '50%', minHeight: isMobile ? 240 : 'auto' }}>
        <div style={s.leftInner} className="fade-in">
          <div style={s.emblemWrap}>
            <KUEmblem size={isMobile ? 100 : 180} variant="dark" />
          </div>
          <h1 style={{ ...s.brand, fontSize: isMobile ? 24 : 36 }}>KU Zoom Booking</h1>
          <p style={{ ...s.tagline, fontSize: isMobile ? 13 : 16, margin: '0 0 8px' }}>
            ระบบจองห้องประชุม Zoom<br />
            <span style={s.taglineAccent}>มหาวิทยาลัยเกษตรศาสตร์</span>
          </p>
        </div>
      </div>

      <div style={s.right}>
        <div style={s.card} className="slide-in">
          <div style={s.cardBadge}>เข้าสู่ระบบ</div>
          <h2 style={s.heading}>ยินดีต้อนรับ</h2>
          <p style={s.desc}>
            ใช้บัญชี Google ของมหาวิทยาลัย<br />
            <strong style={s.strong}>(@ku.th หรือ @ku.ac.th)</strong> เพื่อเข้าใช้งาน
          </p>

          {error && (
            <div style={s.errorBox} role="alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10" stroke="#c62828" strokeWidth="2"/>
                <path d="M12 7v6M12 16.5v.5" stroke="#c62828" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            style={s.btn}
            className="ku-google-btn"
            onClick={() => window.location.href = `${apiBase}/auth/google`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity="0.9"/>
              <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity="0.7"/>
              <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity="0.85"/>
            </svg>
            <span>เข้าสู่ระบบด้วย Google</span>
          </button>

          <div style={s.divider}>
            <div style={s.dividerLine} />
            <span style={s.dividerText}>เฉพาะบุคลากร / นิสิต</span>
            <div style={s.dividerLine} />
          </div>

          <p style={s.note}>
            หากพบปัญหาการเข้าใช้งาน กรุณาติดต่อ<br />
            <strong style={s.noteStrong}>เจ้าหน้าที่ฝ่ายโครงสร้างพื้นฐานและเครือข่ายดิจิทัล</strong><br />
            สำนักบริการคอมพิวเตอร์ มหาวิทยาลัยเกษตรศาสตร์
          </p>
        </div>

        <p style={s.copyright}>
          © {new Date().getFullYear()} Kasetsart University · KU Zoom Booking System
        </p>
      </div>

      <style>{`
        .ku-google-btn {
          transition: transform 0.2s var(--ease), box-shadow 0.2s var(--ease), background 0.2s var(--ease) !important;
        }
        .ku-google-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 20px rgba(1, 74, 50, 0.3) !important;
          background: linear-gradient(135deg, #1FBA7C 0%, #028152 100%) !important;
        }
        .ku-google-btn:active {
          transform: translateY(0);
        }
      `}</style>
    </div>
  )
}

const s = {
  root: {
    display: 'flex', minHeight: '100vh', position: 'relative', overflow: 'hidden'
  },
  bgPattern: {
    position: 'absolute', inset: 0, opacity: 0.04, pointerEvents: 'none',
    backgroundImage: `radial-gradient(circle at 20% 30%, #03A96B 1px, transparent 1px),
                      radial-gradient(circle at 80% 70%, #03A96B 1px, transparent 1px)`,
    backgroundSize: '40px 40px, 60px 60px',
  },
  left: {
    width: '50%', position: 'relative',
    background: 'linear-gradient(135deg, #028152 0%, #03A96B 50%, #014A32 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  leftInner: {
    padding: 48, color: 'white', maxWidth: 480, textAlign: 'center',
    position: 'relative', zIndex: 2,
  },
  emblemWrap: {
    display: 'flex', justifyContent: 'center', marginBottom: 32,
  },
  brand: {
    fontSize: 36, fontWeight: 700, margin: '0 0 12px',
    letterSpacing: '-0.5px', color: '#fff',
    textShadow: '0 2px 12px rgba(0,0,0,0.2)',
  },
  tagline: {
    fontSize: 16, lineHeight: 1.7, opacity: 0.9, margin: '0 0 40px', color: '#fff',
  },
  taglineAccent: {
    color: '#fff', fontWeight: 600,
  },
  right: {
    flex: 1, background: '#f4f6f4',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: '24px', position: 'relative', zIndex: 1,
  },
  card: {
    background: 'white', borderRadius: 20, padding: '48px 40px',
    width: '100%', maxWidth: 400,
    boxShadow: '0 8px 28px rgba(1, 74, 50, 0.12), 0 2px 8px rgba(1, 74, 50, 0.06)',
    border: '1px solid #e1e7e1',
    position: 'relative',
  },
  cardBadge: {
    position: 'absolute', top: -12, left: 32,
    background: 'linear-gradient(135deg, #03A96B 0%, #1FBA7C 100%)',
    color: '#fff', fontSize: 11, fontWeight: 600, letterSpacing: 1,
    padding: '6px 14px', borderRadius: 20,
    boxShadow: '0 4px 12px rgba(1, 74, 50, 0.25)',
    textTransform: 'uppercase',
  },
  heading: {
    fontSize: 26, fontWeight: 700, color: '#1a1a1a',
    margin: '8px 0 8px', letterSpacing: '-0.5px',
  },
  desc: {
    fontSize: 14, color: '#666', lineHeight: 1.7,
    margin: '0 0 28px',
  },
  strong: { color: '#03A96B', fontWeight: 600 },
  errorBox: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    background: '#fff0f0', border: '1px solid #ffcdd2', borderRadius: 10,
    padding: '12px 14px', margin: '0 0 20px',
    color: '#c62828', fontSize: 13, lineHeight: 1.5, textAlign: 'left',
  },
  btn: {
    width: '100%', padding: '14px 0',
    background: 'linear-gradient(135deg, #03A96B 0%, #028152 100%)',
    color: 'white', borderRadius: 10, fontSize: 14, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
    boxShadow: '0 4px 12px rgba(1, 74, 50, 0.2)',
  },
  divider: {
    display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px',
  },
  dividerLine: { flex: 1, height: 1, background: '#e1e7e1' },
  dividerText: { fontSize: 11, color: '#888', letterSpacing: 0.5 },
  note: {
    fontSize: 12, color: '#888', textAlign: 'center',
    margin: 0, lineHeight: 1.8,
  },
  noteStrong: {
    color: '#03A96B', fontWeight: 600,
  },
  copyright: {
    marginTop: 24, fontSize: 11, color: '#999', textAlign: 'center',
  }
}

export default Login
