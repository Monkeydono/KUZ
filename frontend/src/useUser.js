import { useEffect, useState } from 'react'
import api from './api'

// fetch ข้อมูล user ปัจจุบัน (รวม role) จาก backend
// ใช้แทนการ decode JWT เพราะ role ใน DB เป็น authoritative
export function useUser() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.get('/auth/me')
      .then(res => { if (!cancelled) setUser(res.data) })
      .catch(() => { if (!cancelled) setUser(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const role = user?.role
  return {
    user, loading,
    isAdmin: role === 'admin',
    isStaff: role === 'staff',
    isStaffOrAdmin: role === 'admin' || role === 'staff',
    isPriority: role === 'priority',
  }
}
