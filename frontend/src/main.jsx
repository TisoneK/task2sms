import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

// Apply saved theme before first render — prevents flash of wrong theme
;(function () {
  const theme = localStorage.getItem('theme') || 'light'
  document.documentElement.setAttribute('data-theme', theme)
})()

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          borderRadius: '10px',
          fontSize: '14px',
          background: 'var(--card)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-modal)',
        },
        success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } },
        error:   { iconTheme: { primary: '#dc2626', secondary: '#fff' } },
      }}
    />
  </BrowserRouter>
)
