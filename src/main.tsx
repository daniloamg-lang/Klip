import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initEdgeToEdge } from './lib/edge-to-edge'
import { initTheme } from './lib/theme'

initEdgeToEdge()
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
