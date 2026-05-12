import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, X, Check } from 'lucide-react'
import api from '../api'

const POLL_INTERVAL_MS = 30 * 1000

function relativeTime(iso) {
  const now = Date.now()
  const t = new Date(iso).getTime()
  const diff = Math.floor((now - t) / 1000)
  if (diff < 60) return 'เมื่อสักครู่'
  if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ชั่วโมงที่แล้ว`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} วันที่แล้ว`
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TYPE_ICONS = {
  booking_pending_approval: '⏳',
  booking_approved:         '✅',
  booking_rejected:         '❌',
  booking_cancelled_by_admin: '⚠️',
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)

  const fetchUnread = async () => {
    try {
      const res = await api.get('/notifications/unread-count')
      setUnread(res.data.count || 0)
    } catch (e) { /* silent */ }
  }

  const fetchList = async () => {
    setLoading(true)
    try {
      const res = await api.get('/notifications', { params: { limit: 20 } })
      setItems(res.data || [])
    } catch (e) { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchUnread()
    const id = setInterval(fetchUnread, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (open) fetchList()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const onClickItem = async (n) => {
    if (!n.is_read) {
      try {
        await api.post(`/notifications/${n.id}/read`)
        setUnread(u => Math.max(0, u - 1))
        setItems(arr => arr.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      } catch (e) { /* silent */ }
    }
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all')
      setUnread(0)
      setItems(arr => arr.map(x => ({ ...x, is_read: true })))
    } catch (e) { /* silent */ }
  }

  return (
    <div style={s.wrap} ref={dropdownRef}>
      <button
        onClick={() => setOpen(o => !o)}
        style={s.bellBtn}
        aria-label="การแจ้งเตือน"
        className="ku-bell-btn"
      >
        <Bell size={20} color="white" />
        {unread > 0 && (
          <span style={s.badge}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={s.dropdown} className="slide-in">
          <div style={s.header}>
            <h3 style={s.headerTitle}>การแจ้งเตือน</h3>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {unread > 0 && (
                <button onClick={markAllRead} style={s.markAllBtn} title="ทำเครื่องหมายว่าอ่านแล้วทั้งหมด">
                  <Check size={14} /> อ่านทั้งหมด
                </button>
              )}
              <button onClick={() => setOpen(false)} style={s.closeBtn} aria-label="ปิด">
                <X size={16} />
              </button>
            </div>
          </div>

          <div style={s.list}>
            {loading && <div style={s.empty}>กำลังโหลด...</div>}
            {!loading && items.length === 0 && <div style={s.empty}>ยังไม่มีการแจ้งเตือน</div>}
            {!loading && items.map(n => (
              <div
                key={n.id}
                onClick={() => onClickItem(n)}
                style={{
                  ...s.item,
                  ...(n.is_read ? {} : s.itemUnread),
                }}
                className="ku-notif-item"
              >
                <div style={s.icon}>{TYPE_ICONS[n.type] || '📌'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.itemTitle}>
                    {!n.is_read && <span style={s.unreadDot} />}
                    {n.title}
                  </div>
                  {n.message && <div style={s.itemMessage}>{n.message}</div>}
                  <div style={s.itemTime}>{relativeTime(n.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .ku-bell-btn { transition: background 0.2s var(--ease); }
        .ku-bell-btn:hover { background: rgba(255,255,255,0.22) !important; }
        .ku-notif-item { transition: background 0.15s var(--ease); }
        .ku-notif-item:hover { background: #f5fbf8 !important; }
      `}</style>
    </div>
  )
}

const s = {
  wrap: { position: 'relative' },
  bellBtn: {
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(241, 216, 120, 0.25)',
    borderRadius: 20,
    width: 38, height: 38,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    position: 'relative',
    marginRight: 8,
  },
  badge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 18, height: 18, padding: '0 5px',
    background: '#dc2626', color: 'white',
    borderRadius: 10,
    fontSize: 11, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '2px solid #028152',
  },
  dropdown: {
    position: 'absolute', top: 48, right: 0,
    width: 360, maxWidth: 'calc(100vw - 32px)',
    background: 'white',
    borderRadius: 14,
    boxShadow: '0 18px 40px rgba(1, 74, 50, 0.25), 0 4px 12px rgba(0,0,0,0.08)',
    overflow: 'hidden',
    zIndex: 200,
    color: '#1a1a1a',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #f0f0f0',
    background: '#fafafa',
  },
  headerTitle: { fontSize: 15, fontWeight: 700, color: '#014A32', margin: 0 },
  markAllBtn: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'transparent', border: 'none',
    color: '#03A96B', fontSize: 11, fontWeight: 600,
    cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
  },
  closeBtn: {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#888', width: 26, height: 26, borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  list: { maxHeight: 420, overflowY: 'auto' },
  empty: {
    padding: '40px 16px', textAlign: 'center',
    color: '#999', fontSize: 13,
  },
  item: {
    display: 'flex', gap: 12, padding: '12px 16px',
    borderBottom: '1px solid #f4f4f4',
    cursor: 'pointer',
    alignItems: 'flex-start',
  },
  itemUnread: { background: '#f0fbf6' },
  icon: { fontSize: 20, flexShrink: 0, marginTop: 2 },
  itemTitle: {
    fontSize: 13, fontWeight: 600, color: '#1a1a1a',
    marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6,
  },
  unreadDot: {
    display: 'inline-block', width: 7, height: 7,
    borderRadius: '50%', background: '#03A96B',
    flexShrink: 0,
  },
  itemMessage: {
    fontSize: 12, color: '#555', lineHeight: 1.45,
    marginBottom: 4,
    wordBreak: 'break-word',
  },
  itemTime: { fontSize: 11, color: '#999' },
}
