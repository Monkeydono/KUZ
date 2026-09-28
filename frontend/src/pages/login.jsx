import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import KUEmblem from '../components/KUEmblem'
import { useIsMobile } from '../useIsMobile'
import api from '../api'
import { USER_MANUAL_URL, PRIVACY_NOTICE_URL } from '../links'

const GOOGLE_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" opacity="0.9"/>
    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" opacity="0.7"/>
    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" opacity="0.85"/>
  </svg>
)

// เข้าสู่ระบบได้ทางเดียวคือ KU ALL-Login (feedback Rev.1 ข้อ 1 และ 3)
//   ขั้นที่ 1 KU ALL-Login — ยืนยันตัวตน + เก็บประเภทบุคคล/หน่วยงาน
//   ขั้นที่ 2 Google — ขึ้นมาเองหลังขั้นที่ 1 เฉพาะคนที่ยังไม่เคยเชื่อม ต้องเป็นบัญชี KU Workspace @ku.th
//             อีเมลเดียวกับบัญชีนนทรี (backend ตรวจด้วยตั๋วเชื่อมบัญชี)
// /login?step=google = หน้าสำรองของขั้นที่ 2 กรณีเปลี่ยนหน้าไป Google เองไม่สำเร็จ
// ปุ่ม Google ตรงแสดงเฉพาะเครื่อง dev (REQUIRE_KU_PROFILE=false) เพราะ KU ALL-Login ใช้กับ localhost ไม่ได้
function Login() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // ขั้นที่ 2 ใช้ได้เฉพาะคนที่มี token แล้ว (ผ่าน KU ALL-Login มาแล้ว)
  const [step, setStep] = useState(() =>
    new URLSearchParams(window.location.search).get('step') === 'google' && localStorage.getItem('token')
      ? 'google' : 'ku')
  const [email, setEmail] = useState('')
  const [devGoogle, setDevGoogle] = useState(false)

  useEffect(() => {
    // ล็อกอินค้างไว้แล้ว (token จำไว้ในเครื่อง) → ไม่ต้องล็อกอินซ้ำ
    // ยกเว้นหน้าขั้นที่ 2 และกรณีมี error/ข้อความแจ้งให้ผู้ใช้อ่าน
    const q0 = new URLSearchParams(window.location.search)
    if (localStorage.getItem('token') && q0.get('step') !== 'google' && !q0.get('error')) {
      navigate('/calendar', { replace: true })
      return
    }
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
    const err = query.get('error')
    const messages = {
      domain: 'บัญชีนี้เข้าใช้งานไม่ได้ กรุณาเข้าสู่ระบบด้วย KU ALL-Login',
      google_workspace: 'กรุณาเลือกบัญชี Google ของมหาวิทยาลัย @ku.th เท่านั้น ไม่รับบัญชี Gmail ส่วนตัว',
      link_expired: 'ลิงก์เชื่อมบัญชี Google หมดอายุ กรุณาเข้าสู่ระบบด้วย KU ALL-Login อีกครั้ง',
      kulogin: 'เข้าสู่ระบบผ่าน KU ALL-Login ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      kulogin_unconfigured: 'KU ALL-Login ยังไม่เปิดใช้งาน กรุณาแจ้งผู้ดูแลระบบ',
      invalid_state: 'เซสชันการเข้าสู่ระบบหมดอายุหรือไม่ตรงกัน กรุณากดเข้าสู่ระบบใหม่อีกครั้ง',
      ku_domain: 'บัญชี KU ALL-Login นี้ไม่มีอีเมล @ku.th หรือ @ku.ac.th ที่ใช้เข้าระบบได้ กรุณาแจ้งผู้ดูแลระบบ',
      ku_type_forbidden: 'ประเภทบัญชีของคุณไม่มีสิทธิ์ใช้งานระบบนี้ ระบบเปิดให้เฉพาะอาจารย์ บุคลากร และนิสิตปัจจุบัน',
      kulogin_failed: 'เชื่อมต่อกับ KU ALL-Login ไม่สำเร็จ กรุณาลองใหม่ หากยังไม่ได้กรุณาแจ้งผู้ดูแลระบบ',
      google_unconfigured: 'ระบบเข้าสู่ระบบด้วย Google ยังตั้งค่าไม่ครบ กรุณาแจ้งผู้ดูแลระบบ',
      ratelimit: 'มีผู้ใช้งานเข้าสู่ระบบพร้อมกันจำนวนมาก กรุณารอสักครู่แล้วลองใหม่อีกครั้ง',
      server: 'ระบบขัดข้องระหว่างเข้าสู่ระบบ กรุณาลองใหม่ หากยังไม่ได้กรุณาแจ้งผู้ดูแลระบบ',
      google_cancelled: 'ยังเข้าสู่ระบบไม่สำเร็จ เพราะยังไม่ได้อนุญาตสิทธิ์ Google กรุณาเข้าสู่ระบบอีกครั้งและกดอนุญาตสิทธิ์ทั้งหมด',
      google_mismatch: 'บัญชี Google ที่เลือกไม่ตรงกับบัญชีนนทรีที่ใช้เข้า KU ALL-Login กรุณาเข้าสู่ระบบอีกครั้งและเลือกบัญชี Google @ku.th ของตนเอง',
    }
    // ข้อความแนะนำ ไม่ใช่ข้อผิดพลาด
    const notices = {
      need_kulogin: 'กรุณาเข้าสู่ระบบด้วย KU ALL-Login ก่อน ระบบจะพาไปเชื่อมบัญชี Google @ku.th ต่อให้เอง',
      guest_book: 'กรุณาเข้าสู่ระบบก่อนจองห้องประชุม',
    }
    if (err && notices[err]) setNotice(notices[err])
    else if (err && messages[err]) setError(messages[err])
    else if (err) setError('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    if (err) window.history.replaceState(null, '', window.location.pathname)
  }, [navigate])

  // ขั้นที่ 2 ต้องรู้อีเมลเพื่อส่ง login_hint ให้ Google เลือกบัญชีเดียวกับ KU ALL-Login
  useEffect(() => {
    if (step !== 'google') return
    api.get('/auth/me')
      .then(res => {
        if (res.data.has_calendar) navigate('/calendar', { replace: true })
        else setEmail(res.data.email || '')
      })
      .catch(() => setStep('ku'))
  }, [step, navigate])

  // ปุ่ม Google ตรงเฉพาะเครื่อง dev
  useEffect(() => {
    api.get('/auth/config').then(res => setDevGoogle(!!res.data.googleDirectLogin)).catch(() => {})
  }, [])

  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3000'
  // ขั้นที่ 2: ขอลิงก์ Google พร้อมตั๋วเชื่อมบัญชีจาก backend
  const goGoogleLink = () => {
    api.post('/auth/google/link')
      .then(res => { window.location.href = res.data.url })
      .catch(err => setError(err.response?.data?.error || 'เชื่อมบัญชี Google ไม่สำเร็จ กรุณาลองใหม่'))
  }
  const goGoogleDev = () => { window.location.href = `${apiBase}/auth/google` }
  const goKU = () => { window.location.href = `${apiBase}/auth/kulogin` }

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
          <div style={s.cardBadge}>{step === 'google' ? 'ขั้นที่ 2 จาก 2' : 'เข้าสู่ระบบ'}</div>

          {step === 'google' ? (
            <>
              <h2 style={s.heading}>เชื่อมต่อบัญชี Google</h2>
              <p style={s.desc}>
                ยืนยันตัวตนด้วย KU ALL-Login เรียบร้อยแล้ว<br />
                ขั้นต่อไปให้เข้าสู่ระบบด้วย Google {email ? <strong style={s.strong}>{email}</strong> : 'ของมหาวิทยาลัย'}{' '}
                และกดอนุญาตสิทธิ์ Calendar และ Drive เพื่อให้ระบบบันทึกนัดหมายลงปฏิทิน
                และเก็บไฟล์บันทึกการประชุมให้คุณ
              </p>
              {error && <div style={s.errorBox} role="alert"><span>{error}</span></div>}
              <button style={s.btn} className="ku-google-btn" onClick={goGoogleLink}>
                {GOOGLE_ICON}
                <span>เชื่อมต่อบัญชี Google</span>
              </button>
            </>
          ) : (
            <>
              <h2 style={s.heading}>ยินดีต้อนรับ</h2>
              <p style={s.desc}>
                เข้าสู่ระบบด้วยบัญชีนนทรีผ่าน <strong style={s.strong}>KU ALL-Login</strong>
                แล้วระบบจะพาไปเชื่อมบัญชี Google <strong style={s.strong}>@ku.th</strong> ต่อให้อัตโนมัติ
                ทำครั้งเดียว ครั้งต่อไประบบจำไว้ให้
              </p>

              {notice && <div style={s.noticeBox} role="status">{notice}</div>}
              {error && (
                <div style={s.errorBox} role="alert">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                    <circle cx="12" cy="12" r="10" stroke="#c62828" strokeWidth="2"/>
                    <path d="M12 7v6M12 16.5v.5" stroke="#c62828" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <button style={s.btn} className="ku-google-btn" onClick={goKU}>
                <span>เข้าสู่ระบบด้วย KU ALL-Login</span>
              </button>

              {devGoogle && (
                <button style={s.btnKU} className="ku-alllogin-btn" onClick={goGoogleDev}>
                  {GOOGLE_ICON}
                  <span>เข้าด้วย Google โดยตรง · เฉพาะเครื่องพัฒนา</span>
                </button>
              )}

              <button style={s.guestLink} onClick={() => navigate('/calendar')}>
                ดูปฏิทินห้องประชุมโดยไม่เข้าสู่ระบบ
              </button>
            </>
          )}

          <div style={s.divider}>
            <div style={s.dividerLine} />
            <span style={s.dividerText}>เฉพาะอาจารย์ บุคลากร และนิสิต</span>
            <div style={s.dividerLine} />
          </div>

          <p style={s.note}>
            หากพบปัญหาการเข้าใช้งาน กรุณาติดต่อ<br />
            <strong style={s.noteStrong}>Helpdesk สำนักบริการคอมพิวเตอร์</strong><br />
            เว็บไซต์ <a style={s.noteLink} href="https://itsupport.ku.ac.th" target="_blank" rel="noopener noreferrer">itsupport.ku.ac.th</a><br />
            Facebook <a style={s.noteLink} href="https://www.facebook.com/ocs.ku" target="_blank" rel="noopener noreferrer">facebook.com/ocs.ku</a><br />
            โทร. 622541-3
          </p>
        </div>

        <p style={s.copyright}>
          <a style={s.footLink} href={USER_MANUAL_URL} target='_blank' rel='noopener noreferrer'>คู่มือการใช้งาน</a>
          {' · '}
          <a style={s.footLink} href={PRIVACY_NOTICE_URL} target='_blank' rel='noopener noreferrer'>ประกาศความเป็นส่วนตัว</a>
          <br />
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
        .ku-alllogin-btn {
          transition: transform 0.2s var(--ease), box-shadow 0.2s var(--ease), background 0.2s var(--ease) !important;
        }
        .ku-alllogin-btn:hover {
          transform: translateY(-1px);
          background: #f0f9f4 !important;
          box-shadow: 0 6px 16px rgba(1, 74, 50, 0.15) !important;
        }
        .ku-alllogin-btn:active {
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
  btnKU: {
    width: '100%', padding: '14px 0', marginTop: 12,
    background: '#fff', color: '#028152',
    border: '1.5px solid #03A96B', borderRadius: 10, fontSize: 14, fontWeight: 600,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
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
  noteLink: { color: '#028152', textDecoration: 'underline' },
  footLink: { color: '#028152', textDecoration: 'underline' },
  noticeBox: {
    background: '#f0f9f4', border: '1px solid #b5e8d2', borderRadius: 10,
    padding: '12px 14px', margin: '0 0 20px',
    color: '#014a32', fontSize: 13, lineHeight: 1.6, textAlign: 'left',
  },
  guestLink: {
    width: '100%', marginTop: 14, padding: '6px 0',
    background: 'none', border: 'none', color: '#028152',
    fontSize: 13, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit',
  },
  copyright: {
    marginTop: 24, fontSize: 11, color: '#999', textAlign: 'center',
  }
}

export default Login
