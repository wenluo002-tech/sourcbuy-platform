import "@/lib/logger";
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import { TRPCProvider } from "@/providers/trpc"
import { I18nProvider } from "@/i18n"
import { AuthProvider } from "@/auth"
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  // 部署标记：allowedHosts 修复 v56（触发平台重新构建，勿删）
  <StrictMode>
    <BrowserRouter>
      <TRPCProvider>
          <I18nProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </I18nProvider>
        </TRPCProvider>
    </BrowserRouter>
  </StrictMode>,
)
