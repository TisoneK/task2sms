import { useState, useEffect, useCallback } from 'react'
import { tasksApi, notificationsApi } from '../services/api'
import api from '../services/api'
import toast from 'react-hot-toast'

// Deduplicated error toast — same message never shows more than once at a time
function toastError(message) {
  toast.error(message, { id: message })
}

export function useStats() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/stats')
      setStats(data)
    } catch {
      toastError('Failed to load stats')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  return { stats, loading, reload: load }
}

export function useTasks(initialPage = 1, perPage = 20) {
  const [tasks, setTasks] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(initialPage)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const { data } = await tasksApi.list(p, perPage)
      setTasks(data.items)
      setTotal(data.total)
      setPage(p)
    } catch {
      toastError('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [page, perPage])

  useEffect(() => { load(1) }, [])

  const filtered = tasks.filter(t => {
    const matchSearch = !search || t.name.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    return matchSearch && matchStatus
  })

  return {
    tasks: filtered,
    allTasks: tasks,
    total,
    page,
    loading,
    search, setSearch,
    statusFilter, setStatusFilter,
    reload: load,
    setTasks,
  }
}

export function useNotifications(initialPage = 1, perPage = 50) {
  const [notifications, setNotifications] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(initialPage)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const { data } = await notificationsApi.list(p, perPage)
      setNotifications(data.items)
      setTotal(data.total)
      setPage(p)
    } catch {
      toastError('Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }, [page, perPage])

  useEffect(() => { load(1) }, [])

  return { notifications, total, page, loading, reload: load }
}
