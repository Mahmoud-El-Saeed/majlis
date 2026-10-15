import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './features/auth/AuthContext.tsx'
import { LangProvider } from './features/lang/lang.tsx'
import { ToastProvider } from './components/Toast.tsx'

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <MotionConfig reducedMotion="user">
        <ToastProvider>
          <LangProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
          </LangProvider>
        </ToastProvider>
        </MotionConfig>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
