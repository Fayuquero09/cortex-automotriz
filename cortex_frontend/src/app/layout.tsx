import './globals.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AppProvider } from '@/lib/state'
import { I18nProvider } from '@/lib/i18n'
import UserHeader from '@/components/UserHeader'

export const metadata: Metadata = {
  title: 'Cortex Automotriz',
  description: 'Comparador Cortex Automotriz',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="cortex-app">
        <I18nProvider>
          <AppProvider>
            <div className="app-container">
              <header className="app-header">
                <div className="app-brand">
                  <span className="app-title">Cortex Automotriz</span>
                  <span className="app-badge">v2 OEM &amp; Dealers</span>
                </div>
              </header>
              <UserHeader />
              <div className="app-content">
                <div className="app-surface">
                  {children}
                </div>
              </div>
            </div>
          </AppProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
