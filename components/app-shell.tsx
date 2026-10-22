'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogOut, Menu, Moon, ShieldAlert, Sun, X } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState, type ReactNode } from 'react'
import { usePlatport } from '@/components/platport-context'
import { SCENARIOS, type Scenario } from '@/lib/sim/market'

const navigation = [
  ['/', 'Portafolio'],
  ['/estrategias', 'Estrategias'],
  ['/riesgo', 'Riesgo'],
  ['/decisiones', 'Decisiones'],
  ['/copiloto', 'Copiloto'],
  ['/pruebas', 'Pruebas'],
]

export function AppShell({ children, user }: { children: ReactNode; user: string | null }) {
  const port = usePlatport()
  const pathname = usePathname()
  const { resolvedTheme, setTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  // El tema solo se conoce en el navegador: evita que el ícono difiera entre servidor y cliente.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = !mounted || resolvedTheme !== 'light'
  const tick = port.sim.market.tick
  const status = port.sim.breaker.status

  return (
    <div className="app">
      <div className="academic-banner">Simulación académica · dry-run · sin dinero real</div>
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menú">
          {menuOpen ? <X /> : <Menu />}
        </button>
        <div className="brand">
          <span className="brand-mark">WP</span>
          WHOLE PLATPORT <b>/ LITE</b>
        </div>
        <div className="controls">
          <span className="tick">
            T+{String(tick).padStart(4, '0')} · día {Math.floor(tick / 24) + 1},{' '}
            {String(tick % 24).padStart(2, '0')}:00
          </span>
          <select
            value={port.sim.market.scenario}
            onChange={(event) => port.setScenario(event.target.value as Scenario)}
            disabled={port.gateRunning}
            aria-label="Escenario"
          >
            {Object.entries(SCENARIOS).map(([key, scenario]) => (
              <option key={key} value={key}>
                {scenario.label}
              </option>
            ))}
          </select>
          <button onClick={() => port.advance(1)} disabled={port.gateRunning}>+1 tick</button>
          <button onClick={() => port.advance(24)} disabled={port.gateRunning}>+24 ticks</button>
          <button
            className={port.auto ? 'active' : ''}
            onClick={() => port.setAuto(!port.auto)}
            disabled={port.gateRunning}
          >
            Auto {port.auto ? 'on' : 'off'}
          </button>
          <button onClick={port.reset} disabled={port.gateRunning}>Reiniciar</button>
        </div>
        <button
          className="icon-button"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label="Cambiar tema"
        >
          {isDark ? <Sun /> : <Moon />}
        </button>
        <span className={`breaker-pill ${status}`}>
          <ShieldAlert />
          {status === 'kill_switch' ? 'KILL SWITCH' : status}
        </span>
        {user && (
          <form className="session" method="post" action="/api/auth/logout">
            <span className="session-user" title="Usuario de la sesión">{user}</span>
            <button className="icon-button" type="submit" aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut />
            </button>
          </form>
        )}
      </header>
      <div className="layout">
        <aside className={`sidebar ${menuOpen ? 'show' : ''}`}>
          <div className="side-label">NAVEGACIÓN</div>
          {navigation.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={pathname === href ? 'selected' : ''}
            >
              {label}
            </Link>
          ))}
          <div className="side-foot">
            RN-1 / DRY-RUN
            <br />
            Semilla {port.sim.seed}
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </div>
  )
}
