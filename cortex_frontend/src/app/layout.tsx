import './globals.css'
import type { Metadata } from 'next'
import { AppProvider } from '@/lib/state'
import { I18nProvider } from '@/lib/i18n'
import LangSwitcher from '@/components/LangSwitcher'

export const metadata: Metadata = {
  title: 'Cortex Automotriz',
  description: 'Comparador Cortex Automotriz',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const showAdmin = Boolean(process.env.NEXT_PUBLIC_SUPERADMIN_TOKEN);
  const compactNav = (process.env.NEXT_PUBLIC_NAV_COMPACT || '').toLowerCase() === 'true';
  return (
    <html lang="es">
      <body className="cortex-app">
        <I18nProvider>
          <div className="app-container">
            <header className="app-header">
              <div className="app-brand">
                <span className="app-title">Cortex Automotriz</span>
                <span className="app-badge">v2 OEM &amp; Dealers</span>
              </div>
              <nav className="app-nav">
                {compactNav ? (
                  <>
                    {showAdmin ? (
                      <>
                        <a className="app-link" href="/admin/control">Control</a>
                        <a className="app-link" href="/panel/oem">Panel OEM</a>
                        <a className="app-link" href="/panel/dealer">Panel Dealer</a>
                        <a className="app-link" href="/panel/self-service">Panel Self-service</a>
                      </>
                    ) : (
                      <a className="app-link" href="/ui">Inicio</a>
                    )}
                    <LangSwitcher />
                  </>
                ) : (
                  <>
                    <a className="app-link" href="/admin/control">Control</a>
                    <a className="app-link" href="/panel/oem">Panel OEM</a>
                    <a className="app-link" href="/panel/dealer">Panel Dealer</a>
                    <a className="app-link" href="/panel/self-service">Panel Self-service</a>
                    <a className="app-link" href="/membership">Membresía</a>
                    {showAdmin ? <a className="app-link" href="/admin">Superadmin</a> : null}
                    <LangSwitcher />
                  </>
                )}
              </nav>
            </header>
            <AppProvider>
              <div className="app-content">
                <div className="app-surface">
                  {children}
                </div>
              </div>
            </AppProvider>
          </div>
        </I18nProvider>
      </body>
    </html>
  )
}
