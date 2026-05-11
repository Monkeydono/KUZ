import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Users, BarChart3, AlertCircle, X, Search, Trash2, Shield, Download, Activity, Building2, Video, Plus, Edit3, Check } from 'lucide-react'
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
  confirmed:        { text: 'ยืนยันแล้ว', color: '#1FBA7C', bg: '#D9F5E7' },
  pending_approval: { text: 'รออนุมัติ',  color: '#b45309', bg: '#fef3c7' },
  cancelled:        { text: 'ยกเลิก',     color: '#c62828', bg: '#ffebee' },
  completed:        { text: 'เสร็จสิ้น',  color: '#666',    bg: '#f0f0f0' },
}

function Admin() {
  const { user, loading: userLoading, isAdmin, isStaffOrAdmin } = useUser()
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')

  if (userLoading) return null
  if (!isStaffOrAdmin) {
    return (
      <div style={s.root}>
        <Navbar />
        <div style={s.deniedBox}>
          <AlertCircle size={42} style={{ color: '#c62828' }} />
          <h2>ไม่มีสิทธิ์เข้าถึง</h2>
          <p>หน้านี้สำหรับแอดมิน/staff เท่านั้น</p>
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
          <h1 style={s.heading}>{isAdmin ? 'Admin Dashboard' : 'Moderation Dashboard'}</h1>
          <p style={s.sub}>
            {isAdmin
              ? `ภาพรวมระบบจองห้อง Zoom · ${user?.email}`
              : `ตรวจสอบและจัดการ booking · ${user?.email}`}
          </p>
        </div>

        <div style={s.tabBar}>
          <TabBtn icon={<BarChart3 size={16} />}  label="ภาพรวม" active={tab === 'overview'} onClick={() => setTab('overview')} />
          <TabBtn icon={<Calendar size={16} />}   label="การจอง"  active={tab === 'bookings'} onClick={() => setTab('bookings')} />
          <TabBtn icon={<Users size={16} />}      label="ผู้ใช้"   active={tab === 'users'}    onClick={() => setTab('users')} />
          {isAdmin && (
            <TabBtn icon={<Building2 size={16} />}  label="ห้อง"  active={tab === 'rooms'}    onClick={() => setTab('rooms')} />
          )}
          <TabBtn icon={<Activity size={16} />}   label="Audit"   active={tab === 'audit'}    onClick={() => setTab('audit')} />
        </div>

        {tab === 'overview' && <Overview />}
        {tab === 'bookings' && <Bookings isAdmin={isAdmin} />}
        {tab === 'users'    && <UsersTab currentUserId={user?.id} isAdmin={isAdmin} />}
        {tab === 'rooms'    && isAdmin && <RoomsTab />}
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

function Bookings({ isAdmin }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', search: '' })
  const [confirmDel, setConfirmDel] = useState(null)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

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

  const approve = async (id) => {
    if (!confirm('อนุมัติการจองนี้?')) return
    setActionLoading(true)
    try {
      await api.post(`/admin/bookings/${id}/approve`)
      fetchItems()
    } catch (err) {
      alert(err.response?.data?.error || 'อนุมัติไม่สำเร็จ')
    } finally { setActionLoading(false) }
  }

  const reject = async () => {
    if (!rejectModal) return
    setActionLoading(true)
    try {
      await api.post(`/admin/bookings/${rejectModal.id}/reject`, { reason: rejectReason })
      setRejectModal(null)
      setRejectReason('')
      fetchItems()
    } catch (err) {
      alert(err.response?.data?.error || 'ปฏิเสธไม่สำเร็จ')
    } finally { setActionLoading(false) }
  }

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
          <option value="pending_approval">รออนุมัติ</option>
          <option value="confirmed">ยืนยันแล้ว</option>
          <option value="cancelled">ยกเลิก</option>
          <option value="completed">เสร็จสิ้น</option>
        </select>
        {isAdmin && (
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
        )}
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
                // admin ยกเลิกได้ทุก booking ที่ยัง confirmed (รวมที่เริ่มไปแล้ว)
                const canCancel = b.status === 'confirmed'
                return (
                  <tr key={b.id}>
                    <td style={s.td}>
                      <div style={{ fontWeight: 600 }}>{b.title}</div>
                      {b.room_name && (
                        <div style={s.tdMuted}>
                          {b.room_name} · {b.room_capacity} คน
                        </div>
                      )}
                      {b.co_host_emails?.length > 0 && (
                        <div style={s.tdMuted}>+co-host {b.co_host_emails.length}</div>
                      )}
                      {b.notes && (
                        <div
                          style={{
                            marginTop: 6, fontSize: 11, color: '#555',
                            background: '#fafbfa', padding: '4px 8px', borderRadius: 6,
                            border: '1px solid #e6ebe6',
                            maxWidth: 280, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          }}
                          title={b.notes}
                        >
                          <strong style={{ color: '#888' }}>หมายเหตุ:</strong> {b.notes}
                        </div>
                      )}
                    </td>
                    <td style={s.td}>
                      <div>{b.user_name}</div>
                      <div style={s.tdMuted}>{b.user_email}</div>
                    </td>
                    <td style={s.td}>
                      <div>{new Date(b.start_time).toLocaleDateString('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' })}</div>
                      <div style={s.tdMuted}>
                        {new Date(b.start_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}
                        {' – '}
                        {new Date(b.end_time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}
                      </div>
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.badge, color: meta.color, background: meta.bg }}>{meta.text}</span>
                    </td>
                    <td style={{ ...s.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {b.status === 'pending_approval' && (
                        <>
                          <button
                            style={{ ...s.iconBtn, color: '#03A96B', marginRight: 6 }}
                            onClick={() => approve(b.id)}
                            disabled={actionLoading}
                            title="อนุมัติ"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            style={{ ...s.iconBtn, color: '#c62828', marginRight: 6 }}
                            onClick={() => { setRejectModal(b); setRejectReason('') }}
                            disabled={actionLoading}
                            title="ปฏิเสธ"
                          >
                            <X size={14} />
                          </button>
                        </>
                      )}
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

      {rejectModal && (
        <div style={s.overlay} onClick={() => !actionLoading && setRejectModal(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>ปฏิเสธการจอง</h3>
              <button
                style={s.closeBtn}
                onClick={() => setRejectModal(null)}
                disabled={actionLoading}
              ><X size={18} /></button>
            </div>
            <div style={s.modalBody}>
              <p style={{ margin: '0 0 12px' }}>
                ปฏิเสธ <strong>{rejectModal.title}</strong> ของ {rejectModal.user_email}?
              </p>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#333', display: 'block', marginBottom: 6 }}>
                เหตุผล (จะถูกส่งไปอีเมลของผู้จอง)
              </label>
              <textarea
                style={{
                  width: '100%', padding: '10px 12px',
                  border: '1.5px solid #dde3dd', borderRadius: 8,
                  fontSize: 13, minHeight: 70, resize: 'vertical', fontFamily: 'inherit',
                }}
                placeholder="เช่น: ห้องมีงานสำคัญอื่น / รายละเอียดการจองไม่ครบ"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
              />
            </div>
            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={() => setRejectModal(null)} disabled={actionLoading}>
                ไม่ใช่
              </button>
              <button
                style={{ ...s.confirmBtn, opacity: actionLoading ? 0.6 : 1 }}
                onClick={reject}
                disabled={actionLoading}
              >
                {actionLoading ? 'กำลังปฏิเสธ...' : 'ยืนยันปฏิเสธ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UsersTab({ currentUserId, isAdmin }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmRole, setConfirmRole] = useState(null)
  const [roleNext, setRoleNext] = useState('student')
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleError, setRoleError] = useState('')

  const fetchUsers = () => {
    setLoading(true)
    api.get('/admin/users')
      .then(res => setItems(res.data))
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchUsers() }, [])

  const openRoleModal = (u) => {
    setRoleError('')
    setConfirmRole(u)
    setRoleNext(u.role === 'admin' ? 'student' : 'admin')
  }
  const closeRoleModal = () => {
    if (roleSaving) return
    setConfirmRole(null)
    setRoleError('')
  }
  const submitRole = async () => {
    if (!confirmRole) return
    setRoleSaving(true)
    setRoleError('')
    try {
      await api.patch(`/admin/users/${confirmRole.id}/role`, { role: roleNext })
      setConfirmRole(null)
      fetchUsers()
    } catch (err) {
      setRoleError(err.response?.data?.error || 'เปลี่ยน role ไม่สำเร็จ')
    } finally {
      setRoleSaving(false)
    }
  }

  if (loading) return <div style={s.loading}>กำลังโหลด...</div>

  return (
    <div style={s.section}>
      {isAdmin && (
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
      )}
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
                      color: u.role === 'admin' ? '#03A96B'
                           : u.role === 'staff'    ? '#b45309'
                           : u.role === 'priority' ? '#0369a1' : '#666',
                      background: u.role === 'admin' ? '#D9F5E7'
                                : u.role === 'staff'    ? '#fef3c7'
                                : u.role === 'priority' ? '#e0f2fe' : '#f0f0f0',
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
                    {!isSelf && isAdmin && (
                      <button
                        style={s.iconBtn}
                        onClick={() => openRoleModal(u)}
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

      {confirmRole && (
        <div style={s.overlay} onClick={closeRoleModal}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>เปลี่ยนสิทธิ์ผู้ใช้</h3>
              <button style={s.closeBtn} onClick={closeRoleModal} disabled={roleSaving}>
                <X size={18} />
              </button>
            </div>
            <div style={s.modalBody}>
              <p style={{ margin: '0 0 16px', fontSize: 14, color: '#333' }}>
                <strong>{confirmRole.name}</strong>
                <br />
                <span style={{ fontSize: 12, color: '#888' }}>{confirmRole.email}</span>
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['student', 'priority', 'staff', 'admin'].map(r => (
                  <label
                    key={r}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 8,
                      border: `1.5px solid ${roleNext === r ? '#03A96B' : '#e1e7e1'}`,
                      background: roleNext === r ? '#F0FBF6' : 'white',
                      cursor: roleSaving ? 'not-allowed' : 'pointer', fontSize: 13,
                    }}
                  >
                    <input
                      type="radio"
                      name="role-next"
                      value={r}
                      checked={roleNext === r}
                      onChange={e => setRoleNext(e.target.value)}
                      disabled={roleSaving}
                    />
                    <span style={{ fontWeight: 600 }}>{r}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>
                      {r === 'admin'    && 'จัดการทุกอย่างได้'}
                      {r === 'staff'    && 'ตรวจสอบ + ยกเลิก booking ผู้อื่นได้'}
                      {r === 'priority' && 'จองห้อง premium + ไม่จำกัดโควตา'}
                      {r === 'student'  && 'ทั่วไป — 4 ครั้ง/เดือน'}
                    </span>
                  </label>
                ))}
              </div>
              {roleError && (
                <div style={{
                  marginTop: 12, background: '#fff0f0', border: '1px solid #ffcccc',
                  color: '#cc3333', padding: '10px 12px', borderRadius: 10, fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <AlertCircle size={16} style={{ flexShrink: 0 }} />
                  <span>{roleError}</span>
                </div>
              )}
            </div>
            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={closeRoleModal} disabled={roleSaving}>
                ไม่ใช่
              </button>
              <button
                style={{
                  ...s.confirmBtn,
                  background: roleNext === confirmRole.role ? '#999' : '#03A96B',
                  opacity: roleSaving || roleNext === confirmRole.role ? 0.6 : 1,
                }}
                onClick={submitRole}
                disabled={roleSaving || roleNext === confirmRole.role}
              >
                {roleSaving ? 'กำลังบันทึก...' : 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RoomsTab() {
  const [subTab, setSubTab] = useState('rooms')
  return (
    <div style={s.section}>
      <div style={s.tabBar}>
        <TabBtn icon={<Building2 size={14} />} label="ห้อง" active={subTab === 'rooms'}    onClick={() => setSubTab('rooms')} />
        <TabBtn icon={<Video size={14} />}     label="Zoom Account" active={subTab === 'zoom'} onClick={() => setSubTab('zoom')} />
      </div>
      {subTab === 'rooms' ? <RoomsList /> : <ZoomAccountsList />}
    </div>
  )
}

function RoomsList() {
  const [items, setItems] = useState([])
  const [zooms, setZooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null | object (new) | object (existing)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [r, z] = await Promise.all([
        api.get('/admin/rooms'),
        api.get('/admin/zoom-accounts'),
      ])
      setItems(r.data)
      setZooms(z.data)
    } finally { setLoading(false) }
  }
  useEffect(() => { fetchAll() }, [])

  const openNew = () => {
    setError('')
    setEditing({ name: '', capacity: 100, zoom_account_id: '', is_priority_only: false, is_active: true })
  }
  const openEdit = (room) => {
    setError('')
    setEditing({ ...room, zoom_account_id: room.zoom_account_id || '' })
  }
  const close = () => { if (!saving) { setEditing(null); setError('') } }

  const save = async () => {
    setError('')
    if (!editing.name?.trim()) { setError('ต้องระบุชื่อห้อง'); return }
    const cap = parseInt(editing.capacity, 10)
    if (!cap || cap < 1 || cap > 10000) { setError('capacity ต้อง 1-10000'); return }
    setSaving(true)
    try {
      const body = {
        name: editing.name.trim(),
        capacity: cap,
        zoom_account_id: editing.zoom_account_id || null,
        is_priority_only: !!editing.is_priority_only,
        is_active: editing.is_active !== false,
      }
      if (editing.id) {
        await api.patch(`/admin/rooms/${editing.id}`, body)
      } else {
        await api.post('/admin/rooms', body)
      }
      setEditing(null)
      await fetchAll()
    } catch (err) {
      setError(err.response?.data?.error || 'บันทึกไม่สำเร็จ')
    } finally { setSaving(false) }
  }

  const deactivate = async (room) => {
    if (!confirm(`ปิดใช้งานห้อง "${room.name}"? booking เก่ายังคงอยู่ แต่ห้ามจองใหม่`)) return
    try {
      await api.delete(`/admin/rooms/${room.id}`)
      await fetchAll()
    } catch (err) {
      alert(err.response?.data?.error || 'ปิดใช้งานไม่สำเร็จ')
    }
  }

  if (loading) return <div style={s.loading}>กำลังโหลด...</div>

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={s.exportBtn} onClick={openNew}>
          <Plus size={14} /> <span>เพิ่มห้อง</span>
        </button>
      </div>
      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>ชื่อห้อง</th>
              <th style={s.th}>Capacity</th>
              <th style={s.th}>Zoom Account</th>
              <th style={s.th}>Priority only</th>
              <th style={s.th}>สถานะ</th>
              <th style={s.th}>จองล่วงหน้า</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(r => (
              <tr key={r.id}>
                <td style={s.td}><strong>{r.name}</strong></td>
                <td style={s.td}>{r.capacity} คน</td>
                <td style={s.td}>
                  {r.zoom_account_label || <span style={s.tdMuted}>— (ENV default)</span>}
                </td>
                <td style={s.td}>
                  {r.is_priority_only
                    ? <span style={{ ...s.badge, color: '#0369a1', background: '#e0f2fe' }}>Priority</span>
                    : <span style={s.tdMuted}>ทุกคน</span>}
                </td>
                <td style={s.td}>
                  {r.is_active
                    ? <span style={{ ...s.badge, color: '#1FBA7C', background: '#D9F5E7' }}>ใช้งาน</span>
                    : <span style={{ ...s.badge, color: '#888', background: '#f0f0f0' }}>ปิด</span>}
                </td>
                <td style={s.td}>{r.upcoming_count}</td>
                <td style={{ ...s.td, textAlign: 'right' }}>
                  <button style={s.iconBtn} onClick={() => openEdit(r)} title="แก้ไข">
                    <Edit3 size={14} />
                  </button>
                  {r.is_active && (
                    <button
                      style={{ ...s.iconBtn, marginLeft: 6, color: '#c62828' }}
                      onClick={() => deactivate(r)}
                      title="ปิดใช้งาน"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={7} style={s.emptyRow}>ยังไม่มีห้อง</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div style={s.overlay} onClick={close}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>{editing.id ? 'แก้ไขห้อง' : 'เพิ่มห้อง'}</h3>
              <button style={s.closeBtn} onClick={close} disabled={saving}><X size={18} /></button>
            </div>
            <div style={s.modalBody}>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                  ชื่อห้อง
                </label>
                <input
                  style={{ ...s.searchInput, paddingLeft: 12 }}
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="เช่น KU CPE Pro Room"
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                  Capacity (จำนวนคนสูงสุด)
                </label>
                <select
                  style={{ ...s.select, width: '100%' }}
                  value={editing.capacity}
                  onChange={e => setEditing({ ...editing, capacity: parseInt(e.target.value, 10) })}
                >
                  <option value={100}>100 คน (Free / Basic)</option>
                  <option value={300}>300 คน</option>
                  <option value={500}>500 คน</option>
                  <option value={1000}>1000 คน</option>
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                  Zoom Account
                </label>
                <select
                  style={{ ...s.select, width: '100%' }}
                  value={editing.zoom_account_id}
                  onChange={e => setEditing({ ...editing, zoom_account_id: e.target.value })}
                >
                  <option value="">— ใช้ ENV default (Free plan 40 นาที)</option>
                  {zooms.map(z => (
                    <option key={z.id} value={z.id}>{z.label}</option>
                  ))}
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={!!editing.is_priority_only}
                  onChange={e => setEditing({ ...editing, is_priority_only: e.target.checked })}
                />
                จองได้เฉพาะ user role priority/admin
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={editing.is_active !== false}
                  onChange={e => setEditing({ ...editing, is_active: e.target.checked })}
                />
                เปิดใช้งาน
              </label>
              {error && (
                <div style={{
                  marginTop: 12, background: '#fff0f0', border: '1px solid #ffcccc',
                  color: '#cc3333', padding: '10px 12px', borderRadius: 10, fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <AlertCircle size={16} /> <span>{error}</span>
                </div>
              )}
            </div>
            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={close} disabled={saving}>ยกเลิก</button>
              <button
                style={{ ...s.confirmBtn, background: '#03A96B', opacity: saving ? 0.6 : 1 }}
                onClick={save}
                disabled={saving}
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ZoomAccountsList() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const fetchAll = () => {
    setLoading(true)
    api.get('/admin/zoom-accounts').then(r => setItems(r.data)).finally(() => setLoading(false))
  }
  useEffect(fetchAll, [])

  const [healthMap, setHealthMap] = useState({}) // id → {ok, msg, loading}

  const openNew = () => {
    setError('')
    setEditing({ label: '', account_id: '', client_id: '', client_secret: '', max_attendees: 300 })
  }
  const openEdit = (z) => {
    setError('')
    setEditing({
      id: z.id, label: z.label, account_id: z.account_id, client_id: z.client_id,
      client_secret: '',
      max_attendees: z.max_attendees || 300,
    })
  }
  const close = () => { if (!saving) { setEditing(null); setError('') } }

  const save = async () => {
    setError('')
    if (!editing.label?.trim() || !editing.account_id?.trim() || !editing.client_id?.trim()) {
      setError('label, account_id, client_id ต้องระบุ'); return
    }
    if (!editing.id && !editing.client_secret) {
      setError('ต้องระบุ client_secret ตอนสร้างใหม่'); return
    }
    const m = parseInt(editing.max_attendees, 10)
    if (!m || m < 1 || m > 10000) { setError('max_attendees ต้อง 1-10000'); return }
    setSaving(true)
    try {
      const body = {
        label: editing.label.trim(),
        account_id: editing.account_id.trim(),
        client_id: editing.client_id.trim(),
        max_attendees: m,
      }
      if (editing.client_secret) body.client_secret = editing.client_secret
      if (editing.id) {
        await api.patch(`/admin/zoom-accounts/${editing.id}`, body)
      } else {
        await api.post('/admin/zoom-accounts', body)
      }
      setEditing(null)
      fetchAll()
    } catch (err) {
      setError(err.response?.data?.error || 'บันทึกไม่สำเร็จ')
    } finally { setSaving(false) }
  }

  const testHealth = async (z) => {
    setHealthMap(h => ({ ...h, [z.id]: { loading: true } }))
    try {
      const res = await api.get(`/admin/zoom-accounts/${z.id}/health`)
      setHealthMap(h => ({ ...h, [z.id]: { ok: res.data.ok, msg: res.data.message || res.data.error } }))
    } catch (err) {
      setHealthMap(h => ({ ...h, [z.id]: { ok: false, msg: err.response?.data?.error || err.message } }))
    }
  }

  const del = async (z) => {
    if (!confirm(`ลบ Zoom account "${z.label}"?`)) return
    try {
      await api.delete(`/admin/zoom-accounts/${z.id}`)
      fetchAll()
    } catch (err) {
      alert(err.response?.data?.error || 'ลบไม่สำเร็จ')
    }
  }

  if (loading) return <div style={s.loading}>กำลังโหลด...</div>

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={s.exportBtn} onClick={openNew}>
          <Plus size={14} /> <span>เพิ่ม Zoom Account</span>
        </button>
      </div>
      <div style={s.tableCard}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Label</th>
              <th style={s.th}>Account ID</th>
              <th style={s.th}>Max attendees</th>
              <th style={s.th}>Secret</th>
              <th style={s.th}>ห้องที่ใช้</th>
              <th style={s.th}>Health</th>
              <th style={s.th}></th>
            </tr>
          </thead>
          <tbody>
            {items.map(z => {
              const h = healthMap[z.id]
              return (
                <tr key={z.id}>
                  <td style={s.td}><strong>{z.label}</strong></td>
                  <td style={{ ...s.td, fontSize: 11, fontFamily: 'monospace' }}>{z.account_id}</td>
                  <td style={s.td}>{z.max_attendees} คน</td>
                  <td style={{ ...s.td, fontSize: 11, fontFamily: 'monospace' }}>{z.client_secret_masked}</td>
                  <td style={s.td}>{z.room_count}</td>
                  <td style={s.td}>
                    {h?.loading ? (
                      <span style={{ fontSize: 11, color: '#888' }}>กำลังทดสอบ...</span>
                    ) : h ? (
                      <span style={{
                        ...s.badge,
                        color: h.ok ? '#1FBA7C' : '#c62828',
                        background: h.ok ? '#D9F5E7' : '#ffebee',
                      }} title={h.msg}>{h.ok ? 'OK' : 'Fail'}</span>
                    ) : (
                      <button
                        style={{ ...s.iconBtn, fontSize: 11, padding: '4px 8px', width: 'auto' }}
                        onClick={() => testHealth(z)}
                      >Test</button>
                    )}
                  </td>
                  <td style={{ ...s.td, textAlign: 'right' }}>
                    <button style={s.iconBtn} onClick={() => openEdit(z)} title="แก้ไข">
                      <Edit3 size={14} />
                    </button>
                    <button
                      style={{ ...s.iconBtn, marginLeft: 6, color: '#c62828' }}
                      onClick={() => del(z)}
                      title="ลบ"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {items.length === 0 && (
              <tr><td colSpan={7} style={s.emptyRow}>ยังไม่มี Zoom account</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div style={s.overlay} onClick={close}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>{editing.id ? 'แก้ไข Zoom Account' : 'เพิ่ม Zoom Account'}</h3>
              <button style={s.closeBtn} onClick={close} disabled={saving}><X size={18} /></button>
            </div>
            <div style={s.modalBody}>
              {[
                { key: 'label',         label: 'Label (ชื่อแสดง)' },
                { key: 'account_id',    label: 'Account ID' },
                { key: 'client_id',     label: 'Client ID' },
                { key: 'client_secret', label: editing.id ? 'Client Secret (เว้นว่าง = ไม่เปลี่ยน)' : 'Client Secret', secret: true },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                    {f.label}
                  </label>
                  <input
                    style={{ ...s.searchInput, paddingLeft: 12 }}
                    type={f.secret ? 'password' : 'text'}
                    value={editing[f.key] || ''}
                    onChange={e => setEditing({ ...editing, [f.key]: e.target.value })}
                  />
                </div>
              ))}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#333', marginBottom: 6 }}>
                  Max attendees (license limit ของ plan นี้)
                </label>
                <select
                  style={{ ...s.select, width: '100%' }}
                  value={editing.max_attendees || 300}
                  onChange={e => setEditing({ ...editing, max_attendees: parseInt(e.target.value, 10) })}
                >
                  <option value={100}>100 (Basic)</option>
                  <option value={300}>300 (Pro)</option>
                  <option value={500}>500 (Business)</option>
                  <option value={1000}>1000 (Business Plus)</option>
                </select>
              </div>
              {error && (
                <div style={{
                  marginTop: 6, background: '#fff0f0', border: '1px solid #ffcccc',
                  color: '#cc3333', padding: '10px 12px', borderRadius: 10, fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <AlertCircle size={16} /> <span>{error}</span>
                </div>
              )}
            </div>
            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={close} disabled={saving}>ยกเลิก</button>
              <button
                style={{ ...s.confirmBtn, background: '#03A96B', opacity: saving ? 0.6 : 1 }}
                onClick={save}
                disabled={saving}
              >
                {saving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

const ACTION_LABELS = {
  booking_created:           { text: 'สร้างการจอง',     color: '#1FBA7C', bg: '#D9F5E7' },
  booking_pending_approval:  { text: 'รออนุมัติ',       color: '#b45309', bg: '#fef3c7' },
  booking_approved:          { text: 'อนุมัติ',         color: '#1FBA7C', bg: '#D9F5E7' },
  booking_rejected:          { text: 'ปฏิเสธ',          color: '#c62828', bg: '#ffebee' },
  booking_transferred:       { text: 'โอนเจ้าของ',      color: '#0369a1', bg: '#e0f2fe' },
  series_created:            { text: 'สร้าง series',    color: '#03A96B', bg: '#D9F5E7' },
  booking_cancelled:         { text: 'ยกเลิก',          color: '#c62828', bg: '#ffebee' },
  admin_cancelled:           { text: 'Admin ยกเลิก',    color: '#b91c1c', bg: '#fee2e2' },
  role_changed:              { text: 'เปลี่ยน role',    color: '#0369a1', bg: '#e0f2fe' },
  room_created:              { text: 'สร้างห้อง',        color: '#0369a1', bg: '#e0f2fe' },
  room_updated:              { text: 'แก้ห้อง',         color: '#0369a1', bg: '#e0f2fe' },
  room_deactivated:          { text: 'ปิดห้อง',         color: '#888',    bg: '#f0f0f0' },
  zoom_account_created:      { text: 'เพิ่ม Zoom acc.', color: '#0369a1', bg: '#e0f2fe' },
  zoom_account_updated:      { text: 'แก้ Zoom acc.',   color: '#0369a1', bg: '#e0f2fe' },
  zoom_account_deleted:      { text: 'ลบ Zoom acc.',    color: '#888',    bg: '#f0f0f0' },
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
                          dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Bangkok'
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
