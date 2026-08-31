import ReactDOM from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './auth/AuthContext'
import { CONFIG } from './config'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <GoogleOAuthProvider clientId={CONFIG.googleClientId}>
    <AuthProvider>
      <App />
    </AuthProvider>
  </GoogleOAuthProvider>,
)
