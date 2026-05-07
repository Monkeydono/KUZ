import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Users, BarChart3, AlertCircle, X, Search, Trash2, Shield, Download, Activity } from 'lucide-react'
import api from '../api'
import Navbar from '../components/Navbar'
import { useUser } from '../useUser'

async function downloadCSV(path, filename) {
  const res = await api.get(path, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const STATUS_LABELS = {
  confirmed: { text: 'ยืนยันแล้ว', color: '#1FBA7C', bg: '#D9F5E7' },
  cancelled: { text: 'ยกเลิก',     color: '#c62828', bg: '#ffebee' },
  completed: { text: 'เสร็จสิ้น',  color: '#666',    bg: '#f0f0f0' },
}

function Admin() {
  const { user, loading: userLoading, isAdmin } = useUser()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')

  if (userLoading) return null
  if (!isAdmin) {
    return (
      <div style={s.root}>
        <Navbar />
        <div style={s.deniedBox}>
          <AlertCircle size={42} style={{ color: '#c62828' }} />
          <h2>ไม่มีสิทธิ์เข้าถึง</h2>
          <p>หน้านี้สำหรับแอดมินเท่านั้น</p>
          <button style={s.btn} onClick={() => navigate('/calendar')}>กลับไปปฏิทิน</button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.root}>
      <Navbar />
      <div style={s.body}>
        <div style={s.header}>
          <h1 style={s.heading}>Admin Dashboard</h1>
          <p style={s.sub}>ภาพรวมระบบจองห้อง Zoom · {user?.email}</p>
        </div>

        <div style={s.tabBar}>
          <TabBtn icon={<BarChart3 size={16} />} label="ภาพรวม" active={tab === 'overview'} onClick={() => setTab('overview')} />
          <TabBtn icon={<Calendar size={16} />}  label="การจอง"  active={tab === 'bookings'} onClick={() => setTab('bookings')} />
          <TabBtn icon={<Users size={16} />}     label="ผู้ใช้"   active={tab === 'users'}    onClick={() => setTab('users')} />
          <TabBtn icon={<Activity size={16} />}  label="Audit"   active={tab === 'audit'}    onClick={() => setTab('audit')} />
        </div>

        {tab === 'overview' && <Overview />}
        {tab === 'bookings' && <Bookings />}
        {tab === 'users'    && <UsersTab currentUserId={user?.id} />}
        {tab === 'audit'    && <AuditTab />}
      </div>
    </div>
  )
}

function TabBtn({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ ...s.tabBtn, ...(active ? s.tabBtnActive : {}) }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function Overview() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/stats')
      .then(res => setData(res.data))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={s.loading}>กำลังโหลด...</div>
  if (!data) return null

  const { totals, byDay, byStatus, topUsers, peakHours } = data

  return (
    <div style={s.section}>
      <div style={s.statsGrid}>
        <StatCard label="กำลังจะมาถึง" value={totals.upcoming} accent="#1FBA7C" />
        <StatCard label="วันนี้"        value={totals.today} />
        <StatCard label="7 วันล่าสุด"   value={totals.week} />
        <StatCard label="30 วันล่าสุด"  value={totals.month} />
        <StatCard label="ยกเลิก/30 วัน" value={totals.cancelled_month} accent="#c62828" />
        <StatCard label="ผู้ใช้ทั้งหมด"  value={`${totals.users_total} (${totals.admins_total} admin)`} />
      </div>

      <ChartCard
        title="การจองรายวัน (14 วันล่าสุด)"
        rightSlot={
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, background: '#1FBA7C', borderRadius: 2, display: 'inline-block' }} />
              จอง
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, background: '#c62828', borderRadius: 2, display: 'inline-block' }} />
              ยกเลิก
            </span>
          </div>
        }
      >
        <BarChart data={byDay} />
      </ChartCard>

      <div style={s.row2}>
        <ChartCard title="ชั่วโมงนิยม">
          <HourChart data={peakHours} />
        </ChartCard>
        <ChartCard title="สถานะ (30 วัน)">
          <PieList data={byStatus} />
        </ChartCard>
      </div>

      <ChartCard title="Top ผู้ใช้ (30 วัน)">
        {topUsers.length === 0 ? (
          <p style={s.empty}>ยังไม่มีข้อมูล</p>
        ) : (
          <table style={s.table}>
            <thead>
              <tr><th style={s.th}>ผู้ใช้</th><th style={s.th}>อีเมล</th><th style={{ ...s.th, textAlign: 'right' }}>จองสำเร็จ</th></tr>
            </thead>
            <tbody>
              {topUsers.map(u => (
                <tr key={u.email}>
                  <td style={s.td}>{u.name}</td>
                  <td style={s.tdMuted}>{u.email}</td>
                  <td style={{ ...s.td, textAlign: 'right', fontWeight: 600 }}>{u.bookings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChartCard>
    </div>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div style={s.statCard}>
      <span style={s.statLbl}>{label}</span>
      <span style={{ ...s.statVal, color: accent || '#014A32' }}>{value}</span>
    </div>
  )
}

function ChartCard({ title, children, rightSlot }) {
  return (
    <div style={s.chartCard}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 12, gap: 12, flexWrap: 'wrap',
      }}>
        <h3 style={{ ...s.chartTitle, marginBottom: 0 }}>{title}</h3>
        {rightSlot}
      </div>
      {children}
    </div>
  )
}

// SVG bar chart — ไม่พึ่ง library
function BarChart({ data }) {
  if (!data || data.length === 0) return <p style={s.empty}>ยังไม่มีข้อมูล</p>
  const max = Math.max(...data.map(d => Math.max(+d.created, +d.cancelled)), 1)
  const W = 680, H = 200, pad = 30
  const innerW = W - pad * 2
  const barGroupW = innerW / data.length
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200 }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e1e7e1" />
      {data.map((d, i) => {
        const x  = pad + i * barGroupW + barGroupW * 0.15
        const bw = barGroupW * 0.32
        const hC = ((+d.created)   / max) * (H - pad * 2)
        const hX = ((+d.cancelled) / max) * (H - pad * 2)
        return (
          <g key={d.day}>
            <rect x={x}        y={H - pad - hC} width={bw} height={hC} fill="#1FBA7C" rx={2} />
            <rect x={x + bw + 2} y={H - pad - hX} width={bw} height={hX} fill="#c62828" rx={2} />
            <text x={x + bw + 1} y={H - pad + 14} fontSize="9" fill="#888" textAnchor="middle">
              {new Date(d.day).getDate()}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function HourChart({ data }) {
  if (!data || data.length === 0) return <p style={s.empty}>ยังไม่มีข้อมูล</p>
  const hours = Array.from({ length: 24 }, (_, h) => {
    const found = data.find(d => +d.hour === h)
    return { hour: h, count: found ? +found.count : 0 }
  })
  const max = Math.max(...hours.map(h => h.count), 1)
  const W = 360, H = 180, pad = 24
  const bw = (W - pad * 2) / 24
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 180 }}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#e1e7e1" />
      {hours.map(h => {
        const x = pad + h.hour * bw
        const bh = (h.count / max) * (H - pad * 2)
        return (
          <g key={h.hour}>
            <rect x={x + 1} y={H - pad - bh} width={bw - 2} height={bh} fill="#03A96B" rx={1.5} />
            {h.hour % 3 === 0 && (
              <text x={x + bw / 2} y={H - pad + 12} fontSize="9" fill="#888" textAnchor="middle">
                {h.hour}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function PieList({ data }) {
  if (!data || data.length === 0) return <p style={s.empty}>ยังไม่มีข้อมูล</p>
  const total = data.reduce((sum, d) => sum + +d.count, 0)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map(d => {
        const meta = STATUS_LABELS[d.status] || { text: d.status, color: '#888', bg: '#f0f0f0' }
        const pct = total ? ((+d.count / total) * 100).toFixed(0) : 0
        return (
          <div key={d.status}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
              <span style={{ fontWeight: 600, color: meta.color }}>{meta.text}</span>
              <span style={{ color: '#888' }}>{d.count} ({pct}%)</span>
            </div>
            <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: meta.color }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Bookings() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', search: '' })
  const [confirmDel, setConfirmDel] = useState(null)

  const fetchItems = () => {
    setLoading(true)
    const params = {}
    if (filters.status) params.status = filters.status
    if (filters.search) params.search = filters.search
    api.get('/admin/bookings', { params })
      .then(res => setItems(res.data))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchItems() }, [filters])

  const cancel = async (id) => {
    try {
      await api.delete(`/admin/bookings/${id}`)
      setConfirmDel(null)
      fetchItems()
    } catch (err) {
      alert(err.response?.data?.error || 'ยกเลิกไม่สำเร็จ')
    }
  }

  return (
    <div style={s.section}>
      <div style={s.filterBar}>
        <div style={s.searchWrap}>
          <Search size={16} style={s.searchIcon} />
          <input
            style={s.searchInput}
            placeholder="ค้นหา title / email / ชื่อ..."
            value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <select
          style={s.select}
          value={filters.status}
          onChange={e => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">ทุกสถานะ</option>
          <option value="confirmed">ยืนยันแล้ว</option>
          <option value="cancelled">ยกเลิก</option>
          <option value="completed">เสร็จสิ้น</option>
        </select>
        <button
          style={s.exportBtn}
          onClick={() => downloadCSV(
            '/admin/bookings.csv',
            `kuz-bookings-${new Date().toISOString().slice(0,10)}.csv`
          )}
          title="Export ทั้งหมดเป็น CSV"
        >
          <Download size={14} />
          <span>Export CSV</span>
        </button>
      </div>

      <div style={s.tableCard}>
        {loading ? <div style={s.loading}>กำลังโหลด...</div> : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>หัวข้อ</th>
                <th style={s.th}>ผู้จอง</th>
                <th style={s.th}>เวลา</th>
                <th style={s.th}>สถานะ</th>
                <th style={s.th}></th>
              </tr>
            </thead>
            <tbody>
              {items.map(b => {
                const meta = STATUS_LABELS[b.status] || { text: b.status, color: '#888', bg: '#f0f0f0' }
                const canCancel = b.status === 'confirmed' && new Date(b.start_time) > new Date()
                return (
                  <tr key={b.id}>
                    <td style={s.td}>
                      <div style={{ fontWeight: 600 }}>{b.title}</div>
                      {b.co_host_emails?.length > 0 && (
                        <div style={s.tdMuted}>+co-host {b.co_host_emails.length}</div>
                      )}
                    </td>
                    <td style={s.td}>
                      <div>{b.user_name}</div>
                      <div style={s.tdMuted}>{b.user_email}</div>
                    </td>
                    <td style={s.td}>
                      <div>{new Date(b.start_time).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</div>
                      <div style={s.tdMuted}>
                        {new Date(b.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {new Date(b.end_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, color: meta.color, background: meta.bg }}>{meta.text}</span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      {canCancel && (
                        <button style={s.iconBtn} onClick={() => setConfirmDel(b)} title="ยกเลิก">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {items.length === 0 && (
                <tr><td colSpan={5} style={s.emptyRow}>ไม่พบข้อมูล</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {confirmDel && (
        <div style={s.overlay} onClick={() => setConfirmDel(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>ยืนยันการยกเลิก</h3>
              <button style={s.closeBtn} onClick={() => setConfirmDel(null)}><X size={18} /></button>
            </div>
            <div style={s.modalBody}>
              <p>ยกเลิกการจอง <strong>{confirmDel.title}</strong> ของ {confirmDel.user_email}?</p>
            </div>
            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={() => setConfirmDel(null)}>ไม่ใช่</button>
              <button style={s.confirmBtn} onClick={() => cancel(confirmDel.id)}>ยืนยันยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UsersTab({ currentUserId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchUsers = () => {
    setLoading(true)
    api.get('/admin/users')
      .then(res => setItems(res.data))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchUsers() }, [])

  const toggleRole = async (u) => {
    const next = u.role === 'admin' ? 'student' : 'admin'
    if (!confirm(`เปลี่ยน ${u.email} เป็น ${next}?`)) return
    try {
      await api.patch(`/admin/users/${u.id}/role`, { role: next })
      fetchUsers()
    } catch (err) {
      alert(err.response?.data?.error || 'เปลี่ยน role ไม่สำเร็จ')
    }
  }

  if (loading) return <div style={s.loading}>กำลังโหลด...</div>

  return (
    <div style={s.section}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          style={s.exportBtn}
          onClick={() => downloadCSV(
            '/admin/users.csv',
            `kuz-users-${new Date().toISOString().slice(0,10)}.csv`
          )}
        >
          <Download size={14} />
          <span>Export CSV</span>
        </button>
      </div>
      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>ผู้ใช้</th>
              <th style={s.th}>Role</th>
              <th style={s.th}>Quota เดือนนี้</th>
              <th style={s.th}>สถิติ</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(u => {
              const pct = (u.quota_used / u.quota_max) * 100
              const isSelf = u.id === currentUserId
              return (
                <tr key={u.id}>
                  <td style={s.td}>
                    <div style={{ fontWeight: 600 }}>{u.name}</div>
                    <div style={s.tdMuted}>{u.email}</div>
                  </td>
                  <td style={s.td}>
                    <span style={{
                      ...s.badge,
                      color: u.role === 'admin' ? '#03A96B' : '#666',
                      background: u.role === 'admin' ? '#D9F5E7' : '#f0f0f0',
                    }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={s.td}>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>
                      {u.quota_used} / {u.quota_max}
                    </div>
                    <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden', width: 100 }}>
                      <div style={{
                        width: `${Math.min(pct, 100)}%`, height: '100%',
                        background: pct >= 100 ? '#c62828' : '#1FBA7C',
                      }} />
                    </div>
                  </td>
                  <td style={s.td}>
                    <span style={{ color: '#1FBA7C' }}>{u.confirmed_total} จอง</span>
                    {' · '}
                    <span style={{ color: '#c62828' }}>{u.cancelled_total} ยกเลิก</span>
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    {!isSelf && (
                      <button
                        style={s.iconBtn}
                        onClick={() => toggleRole(u)}
                        title={u.role === 'admin' ? 'ลด role' : 'เลื่อน role'}
                      >
                        <Shield size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const ACTION_LABELS = {
  booking_created:    { text: 'สร้างการจอง',    color: '#1FBA7C', bg: '#D9F5E7' },
  series_created:     { text: 'สร้าง series',    color: '#03A96B', bg: '#D9F5E7' },
  booking_cancelled:  { text: 'ยกเลิก',          color: '#c62828', bg: '#ffebee' },
  admin_cancelled:    { text: 'Admin ยกเลิก',    color: '#b91c1c', bg: '#fee2e2' },
  role_changed:       { text: 'เปลี่ยน role',    color: '#0369a1', bg: '#e0f2fe' },
}

function AuditTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ action: '' })

  const fetchItems = () => {
    setLoading(true)
    const params = {}
    if (filters.action) params.action = filters.action
    api.get('/admin/audit-logs', { params })
      .then(res => setItems(res.data))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchItems() }, [filters])

  return (
    <div style={s.section}>
      <div style={s.filterBar}>
        <select
          style={s.select}
          value={filters.action}
          onChange={e => setFilters({ ...filters, action: e.target.value })}
        >
          <option value="">ทุก action</option>
          {Object.entries(ACTION_LABELS).map(([v, m]) => (
            <option key={v} value={v}>{m.text}</option>
          ))}
        </select>
      </div>

      <div style={s.tableCard}>
        {loading ? <div style={s.loading}>กำลังโหลด...</div> : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>เวลา</th>
                <th style={s.th}>ผู้ใช้</th>
                <th style={s.th}>Action</th>
                <th style={s.th}>การจอง</th>
                <th style={s.th}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {items.map(a => {
                const meta = ACTION_LABELS[a.action] || { text: a.action, color: '#666', bg: '#f0f0f0' }
                return (
                  <tr key={a.id}>
                    <td style={s.td}>
                      <div style={{ fontSize: 12 }}>
                        {new Date(a.created_at).toLocaleString('th-TH', {
                          dateStyle: 'short', timeStyle: 'medium'
                        })}
                      </div>
                    </td>
                    <td style={s.td}>
                      {a.user_name ? (
                        <>
                          <div>{a.user_name}</div>
                          <div style={s.tdMuted}>{a.user_email}</div>
                        </>
                      ) : (
                        <span style={s.tdMuted}>—</span>
                      )}
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, color: meta.color, background: meta.bg }}>
                        {meta.text}
                      </span>
                    </td>
                    <td style={s.td}>
                      {a.booking_title || <span style={s.tdMuted}>—</span>}
                    </td>
                    <td style={s.td}>
                      <code style={{ fontSize: 11, color: '#555', wordBreak: 'break-all' }}>
                        {a.detail ? JSON.stringify(a.detail) : '—'}
                      </code>
                    </td>
                  </tr>
                )
              })}
              {items.length === 0 && (
                <tr><td colSpan={5} style={s.emptyRow}>ไม่มีบันทึก</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

const s = {
  root: { minHeight: '100vh', background: '#f4f6f4' },
  body: { maxWidth: 1100, margin: '0 auto', padding: '24px 16px' },
  header: { marginBottom: 24 },
  heading: { fontSize: 26, fontWeight: 700, color: '#014A32', margin: 0 },
  sub: { fontSize: 13, color: '#888', margin: '6px 0 0' },
  tabBar: {
    display: 'flex', gap: 8, marginBottom: 20,
    background: 'white', padding: 6, borderRadius: 12,
    border: '1px solid #e1e7e1', width: 'fit-content',
  },
  tabBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 8,
    background: 'transparent', color: '#666', border: 'none',
    fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
  tabBtnActive: {
    background: 'linear-gradient(135deg, #03A96B 0%, #1FBA7C 100%)',
    color: 'white', fontWeight: 600,
  },
  section: { display: 'flex', flexDirection: 'column', gap: 16 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  statCard: {
    background: 'white', borderRadius: 12, padding: '14px 16px',
    border: '1px solid #e1e7e1',
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  statLbl: { fontSize: 11, color: '#888', fontWeight: 500 },
  statVal: { fontSize: 22, fontWeight: 700, lineHeight: 1.1 },
  chartCard: {
    background: 'white', borderRadius: 14, padding: 20,
    border: '1px solid #e1e7e1',
  },
  chartTitle: { fontSize: 14, fontWeight: 600, color: '#014A32', margin: '0 0 12px' },
  row2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 },
  empty: { fontSize: 13, color: '#888', textAlign: 'center', padding: 30 },
  loading: { fontSize: 14, color: '#888', textAlign: 'center', padding: 40 },
  filterBar: {
    display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
    background: 'white', padding: 12, borderRadius: 12,
    border: '1px solid #e1e7e1',
  },
  searchWrap: { position: 'relative', flex: 1 },
  searchIcon: {
    position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
    color: '#888',
  },
  searchInput: {
    width: '100%', padding: '9px 12px 9px 32px',
    border: '1.5px solid #dde3dd', borderRadius: 8,
    fontSize: 13, background: '#fafbfa',
  },
  select: {
    padding: '9px 12px', border: '1.5px solid #dde3dd',
    borderRadius: 8, fontSize: 13, background: 'white',
  },
  exportBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 14px', border: '1.5px solid #03A96B',
    borderRadius: 8, fontSize: 13, fontWeight: 600,
    color: '#03A96B', background: 'white', cursor: 'pointer',
  },
  tableCard: {
    background: 'white', borderRadius: 12,
    border: '1px solid #e1e7e1', overflow: 'auto',
    maxWidth: '100%',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '10px 14px', fontSize: 11,
    color: '#888', fontWeight: 600, textTransform: 'uppercase',
    background: '#fafbfa', borderBottom: '1px solid #e1e7e1',
  },
  td: { padding: '12px 14px', borderBottom: '1px solid #f0f0f0', color: '#1a1a1a', verticalAlign: 'top' },
  tdMuted: { fontSize: 11, color: '#888' },
  badge: {
    fontSize: 11, fontWeight: 600, padding: '3px 9px',
    borderRadius: 12, whiteSpace: 'nowrap',
  },
  iconBtn: {
    background: '#fafbfa', border: '1px solid #e1e7e1', borderRadius: 8,
    width: 30, height: 30, display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center',
    color: '#666', cursor: 'pointer',
  },
  emptyRow: { padding: 30, textAlign: 'center', color: '#888' },
  overlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(1, 74, 50, 0.45)',
    backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 100, padding: 20,
  },
  modal: {
    background: 'white', borderRadius: 18, width: '100%', maxWidth: 440,
    boxShadow: '0 24px 60px rgba(1, 74, 50, 0.35)',
    overflow: 'hidden',
  },
  modalHeader: {
    position: 'relative',
    padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0',
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: '#014A32', margin: 0, textAlign: 'center' },
  closeBtn: {
    position: 'absolute', top: 14, right: 14,
    width: 32, height: 32, borderRadius: 8,
    color: '#888', background: 'transparent',
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalBody: { padding: '20px 24px', fontSize: 14, color: '#333' },
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
    fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
  },
  deniedBox: {
    maxWidth: 440, margin: '80px auto', textAlign: 'center',
    background: 'white', padding: 40, borderRadius: 18,
    border: '1px solid #e1e7e1',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
  },
  btn: {
    padding: '11px 22px',
    background: 'linear-gradient(135deg, #03A96B 0%, #028152 100%)',
    color: 'white', borderRadius: 10,
    fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer',
  },
}

export default Admin
