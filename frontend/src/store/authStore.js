import { create } from 'zustand'
import { authApi } from '../services/api'

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  token: localStorage.getItem('token') || null,
  isLoading: false,

  login: async (username, password) => {
    set({ isLoading: true })
    try {
      const { data } = await authApi.login({ username, password })
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      set({ user: data.user, token: data.access_token, isLoading: false })
      return { success: true }
    } catch (err) {
      set({ isLoading: false })
      return { success: false, error: err.response?.data?.detail || 'Login failed' }
    }
  },

  register: async (formData) => {
    set({ isLoading: true })
    try {
      const { data } = await authApi.register(formData)
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      set({ user: data.user, token: data.access_token, isLoading: false })
      return { success: true }
    } catch (err) {
      set({ isLoading: false })
      return { success: false, error: err.response?.data?.detail || 'Registration failed' }
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    set({ user: null, token: null })
  },
}))

export default useAuthStore
