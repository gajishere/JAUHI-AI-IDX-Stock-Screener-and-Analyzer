import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import { LanguageProvider } from './lib/i18n'
import { ThemeProvider } from './lib/theme'
import { SoundProvider } from './lib/sound'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <SoundProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </SoundProvider>
      </LanguageProvider>
    </ThemeProvider>
  </StrictMode>,
)
