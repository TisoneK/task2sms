import { create } from 'zustand'

// Apply theme to DOM immediately (called on init and on change)
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
}

// Read theme on module load so it's ready before React renders
const initialTheme = localStorage.getItem('theme') || 'light'
applyTheme(initialTheme)

const useThemeStore = create((set) => ({
  theme: initialTheme,

  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },

  toggleTheme: () => {
    const current = localStorage.getItem('theme') || 'light'
    const next = current === 'light' ? 'dark' : 'light'
    applyTheme(next)
    set({ theme: next })
  },
}))

export default useThemeStore
