import { useNavigate, useLocation } from 'react-router-dom'

function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    if (!confirm('ต้องการออกจากระบบใช่หรือไม่?')) return
    localStorage.removeItem('token')
    navigate('/login')
  }

  const isActive = (path) => location.pathname === path

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
            <span style={s.logoText}>KU</span>
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
        <span style={s.navBtn} className="ku-nav-btn" onClick={handleLogout}>
          ออกจากระบบ
        </span>
      </div>

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
    background: 'linear-gradient(90deg, #134d20 0%, #1b5e20 50%, #134d20 100%)',
    padding: '0 40px', height: 68,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    boxShadow: '0 4px 20px rgba(13, 61, 24, 0.18)',
    position: 'sticky', top: 0, zIndex: 50,
    borderBottom: '1px solid rgba(241, 216, 120, 0.2)',
  },
  navLeft: { display: 'flex', alignItems: 'center' },
  logoBtn: {
    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
  },
  logoMark: {
    width: 38, height: 38, borderRadius: 10,
    background: 'linear-gradient(135deg, #f1d878 0%, #c9a227 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.4)',
  },
  logoText: {
    fontSize: 14, fontWeight: 800, color: '#0d3d18', letterSpacing: -0.5,
  },
  brandWrap: { display: 'flex', flexDirection: 'column', lineHeight: 1.1 },
  navBrand: {
    color: 'white', fontWeight: 600, fontSize: 17, letterSpacing: '0.2px',
  },
  navSub: {
    color: 'rgba(241, 216, 120, 0.85)', fontSize: 11, fontWeight: 400, marginTop: 2,
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
}

export default Navbar
