import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { X } from 'lucide-react'
import KUEmblem from './KUEmblem'

function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [showLogout, setShowLogout] = useState(false)

  const isActive = (path) => location.pathname === path

  const doLogout = () => {
    localStorage.removeItem('token')
    setShowLogout(false)
    navigate('/login')
  }

  const links = [
    { path: '/calendar',    label: 'ปฏิทิน' },
    { path: '/book',        label: 'จองห้อง' },
    { path: '/my-bookings', label: 'การจองของฉัน' },
  ]

  return (
    <nav style={s.nav}>
      <div style={s.navLeft}>
        <div
          style={s.logoBtn}
          className="ku-logo"
          onClick={() => navigate('/calendar')}
        >
          <div style={s.logoMark}>
            <KUEmblem size={42} variant="dark" />
          </div>
          <div style={s.brandWrap}>
            <span style={s.navBrand}>KU Zoom Booking</span>
            <span style={s.navSub}>มหาวิทยาลัยเกษตรศาสตร์</span>
          </div>
        </div>
      </div>

      <div style={s.navLinks}>
        {links.map(link => (
          <span
            key={link.path}
            style={{
              ...s.navLink,
              ...(isActive(link.path) ? s.navLinkActive : {}),
            }}
            className="ku-nav-link"
            onClick={() => navigate(link.path)}
          >
            {link.label}
            {isActive(link.path) && <div style={s.activeDot} />}
          </span>
        ))}
        <span style={s.navBtn} className="ku-nav-btn" onClick={() => setShowLogout(true)}>
          ออกจากระบบ
        </span>
      </div>

      {showLogout && (
        <div style={s.overlay} onClick={() => setShowLogout(false)}>
          <div style={s.modal} className="slide-in" onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>ยืนยันการออกจากระบบ</h3>
              <button style={s.closeBtn} onClick={() => setShowLogout(false)} aria-label="ปิด">
                <X size={18} />
              </button>
            </div>
            <div style={s.modalBody}>
              <p style={s.modalText}>ต้องการออกจากระบบใช่หรือไม่?</p>
            </div>
            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={() => setShowLogout(false)}>
                ยกเลิก
              </button>
              <button style={s.confirmBtn} onClick={doLogout}>
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ku-logo { transition: transform 0.2s var(--ease); }
        .ku-logo:hover { transform: scale(1.02); }

        .ku-nav-link {
          transition: color 0.2s var(--ease);
          position: relative;
        }
        .ku-nav-link:hover { color: #fff !important; }

        .ku-nav-btn {
          transition: background 0.2s var(--ease), transform 0.15s var(--ease);
        }
        .ku-nav-btn:hover {
          background: rgba(255,255,255,0.22) !important;
          transform: translateY(-1px);
        }
      `}</style>
    </nav>
  )
}

const s = {
  nav: {
    background: 'linear-gradient(90deg, #028152 0%, #03A96B 50%, #028152 100%)',
    padding: '0 40px', height: 68,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 4px 20px rgba(1, 74, 50, 0.18)',
    position: 'sticky', top: 0, zIndex: 50,
    borderBottom: '1px solid rgba(241, 216, 120, 0.2)',
  },
  navLeft: { display: 'flex', alignItems: 'center' },
  logoBtn: {
    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
  },
  logoMark: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  brandWrap: { display: 'flex', flexDirection: 'column', lineHeight: 1.1 },
  navBrand: {
    color: 'white', fontWeight: 600, fontSize: 17, letterSpacing: '0.2px',
  },
  navSub: {
    color: 'rgba(255, 255, 255, 0.7)', fontSize: 11, fontWeight: 400, marginTop: 2,
  },
  navLinks: { display: 'flex', alignItems: 'center', gap: 8 },
  navLink: {
    color: 'rgba(255,255,255,0.75)', cursor: 'pointer',
    fontSize: 14, fontWeight: 500,
    padding: '8px 14px', borderRadius: 8,
    position: 'relative',
  },
  navLinkActive: {
    color: '#fff', fontWeight: 600,
    background: 'rgba(255,255,255,0.1)',
  },
  activeDot: {
    position: 'absolute', bottom: 2, left: '50%',
    transform: 'translateX(-50%)',
    width: 4, height: 4, borderRadius: '50%',
    background: '#f1d878',
  },
  navBtn: {
    color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    background: 'rgba(255,255,255,0.12)', padding: '8px 18px',
    borderRadius: 20, border: '1px solid rgba(241, 216, 120, 0.25)',
    marginLeft: 12,
  },
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(1, 74, 50, 0.45)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 20,
    animation: 'fadeIn 0.2s var(--ease)',
  },
  modal: {
    background: 'white', borderRadius: 18, width: '100%', maxWidth: 420,
    boxShadow: '0 24px 60px rgba(1, 74, 50, 0.35), 0 8px 24px rgba(1, 74, 50, 0.15)',
    overflow: 'hidden',
    color: '#1a1a1a',
  },
  modalHeader: {
    position: 'relative',
    padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0',
  },
  modalTitle: {
    fontSize: 18, fontWeight: 700, color: '#014A32', margin: 0,
    textAlign: 'center',
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 14,
    width: 32, height: 32, borderRadius: 8,
    color: '#888', background: 'transparent',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', cursor: 'pointer',
  },
  modalBody: { padding: '20px 24px' },
  modalText: { fontSize: 14, color: '#333', margin: 0, lineHeight: 1.6, textAlign: 'center' },
  modalFooter: {
    display: 'flex', gap: 10, padding: '12px 24px 20px',
    borderTop: '1px solid #f0f0f0',
  },
  cancelBtn: {
    flex: 1, padding: '11px 0',
    border: '1.5px solid #dde3dd', borderRadius: 10,
    fontSize: 14, fontWeight: 600, color: '#666',
    background: 'white', cursor: 'pointer',
  },
  confirmBtn: {
    flex: 1, padding: '11px 0',
    background: '#c62828', color: 'white', borderRadius: 10,
    fontSize: 14, fontWeight: 600,
    border: 'none', cursor: 'pointer',
  },
}

export default Navbar
