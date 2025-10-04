import './globals.css'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { AppProvider } from '@/lib/state'
import { I18nProvider } from '@/lib/i18n'
import LangSwitcher from '@/components/LangSwitcher'

type NavItem = {
  label: string;
  href?: string;
  children?: NavItem[];
};

export const metadata: Metadata = {
  title: 'Cortex Automotriz',
  description: 'Comparador Cortex Automotriz',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const showAdmin = Boolean(process.env.NEXT_PUBLIC_SUPERADMIN_TOKEN);
  const compactNav = (process.env.NEXT_PUBLIC_NAV_COMPACT || '').toLowerCase() === 'true';
  const adminNav: NavItem[] = compactNav
    ? [
        { href: '/admin/control', label: 'Control' },
        { href: '/panel/oem', label: 'Operación OEM' },
        { href: '/panel/dealer', label: 'Operación grupos' },
        { href: '/panel/self-service', label: 'Self-service' },
      ]
    : [
        { href: '/admin/control', label: 'Control' },
        { href: '/panel/oem', label: 'Operación OEM' },
        { href: '/panel/dealer', label: 'Operación grupos' },
        { href: '/panel/self-service', label: 'Self-service' },
        { href: '/membership', label: 'Membresía' },
      ];

  const dealerNav: NavItem[] = compactNav
    ? [
        { href: '/ui', label: 'Inicio' },
      ]
    : [
        { href: '/dealers', label: 'Panel Dealer' },
        { href: '/membership', label: 'Membresía' },
      ];

  const navItems = showAdmin ? adminNav : dealerNav;
  const showSuperadminLink = showAdmin && !compactNav;

  const renderNavItem = (item: NavItem, index: number): ReactNode => {
    if (!item.href) {
      return (
        <span key={`${item.label}-${index}`} className="app-link app-link-disabled">{item.label}</span>
      );
    }

    return (
      <a key={item.href} className="app-link" href={item.href}>{item.label}</a>
    );
  };

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
                {navItems.map((item, index) => renderNavItem(item, index))}
                {showSuperadminLink ? <a className="app-link" href="/admin">Superadmin</a> : null}
                <LangSwitcher />
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
