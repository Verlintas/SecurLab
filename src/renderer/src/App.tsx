import type { ComponentType } from 'react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Dashboard from './pages/Dashboard'
import Lab from './pages/Lab'
import Run from './pages/Run'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import { useUi, type Page } from './store/ui'

const views: Record<Page, ComponentType> = {
  dashboard: Dashboard,
  lab: Lab,
  run: Run,
  reports: Reports,
  settings: Settings
}

export default function App() {
  const page = useUi((s) => s.page)
  const View = views[page]
  const flush = page === 'run' || page === 'lab'

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className={flush ? 'min-h-0 flex-1 overflow-hidden' : 'flex-1 overflow-y-auto'}>
          {flush ? (
            <View />
          ) : (
            <div className="mx-auto max-w-5xl px-8 py-8">
              <View />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
