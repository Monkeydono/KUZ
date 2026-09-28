import { useEffect, useState } from 'react'
import api from './api'

// fetch ข้อมูล user ปัจจุบัน (รวม role) จาก backend
// ใช้แทนการ decode JWT เพราะ role ใน DB เป็น authoritative
export function useUser() {
  // guest (ไม่มี token) ไม่ต้องเรียก /auth/me
  const hasToken = Boolean(localStorage.getItem('token'))
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(hasToken)

  useEffect(() => {
    if (!hasToken) return
    let cancelled = false
    api.get('/auth/me')
      .then(res => {
        // backend ต่ออายุ token ให้ → เก็บทับของเดิม จะได้ไม่ต้องล็อกอินใหม่
        if (res.data.token) localStorage.setItem('token', res.data.token)
        if (!cancelled) setUser(res.data)
      })
      .catch(() => { if (!cancelled) setUser(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [hasToken])

  const role = user?.role
  return {
    user, loading,
    isAdmin: role === 'admin',
    isStaff: role === 'staff',
    isStaffOrAdmin: role === 'admin' || role === 'staff',
    isPriority: role === 'priority',
  }
}
