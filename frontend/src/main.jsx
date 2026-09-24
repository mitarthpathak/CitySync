import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import 'leaflet/dist/leaflet.css'
import './styles/globals.css'
import './styles/app.css'
import { ThemeProvider } from './app/ThemeProvider.jsx'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
    {import.meta.env.PROD && <Analytics />}
  </StrictMode>,
)
