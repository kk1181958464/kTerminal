import './assets/main.css'

import { createRoot } from 'react-dom/client'
import App from './App'

// No StrictMode: its double-mount would open each SSH connection twice in dev.
createRoot(document.getElementById('root')!).render(<App />)
