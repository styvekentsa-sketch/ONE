import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { installTapFeedback } from './utils/feedback'

// Vibration et son doux à chaque appui tactile (désactivables dans Réglages).
installTapFeedback()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
