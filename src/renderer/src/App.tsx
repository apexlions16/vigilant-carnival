import { useState, useEffect, createContext, useContext, ReactNode } from 'react'
import './assets/main.css'

import CharactersPage from './pages/CharactersPage'
import ArtistsPage from './pages/ArtistsPage'
import TranslationsPage from './pages/TranslationsPage'
import FilesPage from './pages/FilesPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import HealthPage from './pages/HealthPage'
import FileWatcherUI from './components/FileWatcherUI'
import DashboardPage from './pages/DashboardPage'

interface Project {
  id: string
  name: string
  game_title: string
  source_language: string
  target_language: string
  project_path: string
  status: string
  created_at: string
  updated_at: string
}

interface ProjectProgress {
  total_files: number
  translated_count: number
  recorded_count: number
  mixed_count: number
  translation_percent: number
  recording_percent: number
  mixing_percent: number
  overall_percent: number
}

interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
}

interface AppContextType {
  project: Project | null
  progress: ProjectProgress | null
  isProjectOpen: boolean
  openProject: (projectPath: string) => Promise<boolean>
  closeProject: () => Promise<void>
  refreshProgress: () => Promise<void>
  currentPage: string
  setCurrentPage: (page: string) => void
  toasts: ToastMessage[]
  showToast: (type: ToastMessage['type'], title: string, message?: string) => void
  dismissToast: (id: string) => void
  theme: 'dark' | 'light'
  toggleTheme: () => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
}

const AppContext = createContext<AppContextType | null>(null)

export function useApp(): AppContextType {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}

function AppProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<Project | null>(null)
  const [progress, setProgress] = useState<ProjectProgress | null>(null)
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
      document.documentElement.classList.remove('light')
    } else {
      document.documentElement.classList.add('light')
      document.documentElement.classList.remove('dark')
    }
  }, [theme])

  const showToast = (type: ToastMessage['type'], title: string, message?: string) => {
    const id = Date.now().toString()
    const toast: ToastMessage = { id, type, title, message }
    setToasts(prev => [...prev, toast])

    setTimeout(() => {
      dismissToast(id)
    }, 5000)
  }

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  const openProject = async (projectPath: string): Promise<boolean> => {
    setIsLoading(true)
    try {
      const result = await window.api.invoke('project:open', projectPath) as any

      if (result.success) {
        setProject(result.project)
        setProgress(result.progress)
        setCurrentPage('dashboard')

        try {
          await window.api.invoke('file-watcher:start', {
            project_id: result.project.id,
            project_path: result.project.project_path,
          })
        } catch {}

        showToast('success', 'Proje açıldı', result.project.name)
        return true
      } else {
        showToast('error', 'Proje açılamadı', result.error)
        return false
      }
    } catch (error: any) {
      showToast('error', 'Hata', error.message)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const closeProject = async (): Promise<void> => {
    try {
      try {
        await window.api.invoke('file-watcher:stop')
      } catch {}

      await window.api.invoke('project:close')
      setProject(null)
      setProgress(null)
      setCurrentPage('dashboard')
      showToast('info', 'Proje kapatıldı')
    } catch (error: any) {
      showToast('error', 'Hata', error.message)
    }
  }

  const refreshProgress = async (): Promise<void> => {
    if (!project) return
    try {
      const result = await window.api.invoke('project:get-progress', project.id) as any
      if (result.success) setProgress(result.progress)
    } catch (error) {
      console.error('İlerleme yenilenemedi:', error)
    }
  }

  const value: AppContextType = {
    project,
    progress,
    isProjectOpen: project !== null,
    openProject,
    closeProject,
    refreshProgress,
    currentPage,
    setCurrentPage,
    toasts,
    showToast,
    dismissToast,
    theme,
    toggleTheme,
    isLoading,
    setIsLoading,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

function ToastContainer() {
  const { toasts, dismissToast } = useApp()

  if (toasts.length === 0) return null

  const getToastStyles = (type: ToastMessage['type']) => {
    switch (type) {
      case 'success':
        return 'bg-success-500/20 border-success-500/50 text-success-400'
      case 'error':
        return 'bg-danger-500/20 border-danger-500/50 text-danger-400'
      case 'warning':
        return 'bg-warning-500/20 border-warning-500/50 text-warning-400'
      case 'info':
        return 'bg-info-500/20 border-info-500/50 text-info-400'
    }
  }

  const getToastIcon = (type: ToastMessage['type']) => {
    switch (type) {
      case 'success': return '✓'
      case 'error': return '✕'
      case 'warning': return '⚠'
      case 'info': return 'ℹ'
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`
            flex items-start gap-3 px-4 py-3 rounded-lg border
            backdrop-blur-sm shadow-lg min-w-[300px] max-w-[400px]
            animate-slide-up ${getToastStyles(toast.type)}
          `}
        >
          <span className="text-lg">{getToastIcon(toast.type)}</span>
          <div className="flex-1">
            <p className="font-medium">{toast.title}</p>
            {toast.message && <p className="text-sm opacity-80 mt-0.5">{toast.message}</p>}
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            className="text-current opacity-60 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

function WelcomeScreen() {
  const { openProject, showToast, isLoading, setIsLoading } = useApp()
  const [recentProjects, setRecentProjects] = useState<any[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => {
    loadRecentProjects()
  }, [])

  const loadRecentProjects = async () => {
    try {
      const result = await window.api.invoke('project:list-recent') as any
      if (result.success) setRecentProjects(result.projects || [])
    } catch (error) {
      console.error('Son projeler yüklenemedi:', error)
    }
  }

  const handleOpenProject = async () => {
    try {
      const result = await window.api.invoke('dialog:select-folder', {
        title: 'Proje Klasörü Seç',
      }) as any

      if (result.success && result.path) {
        await openProject(result.path)
      }
    } catch (error: any) {
      showToast('error', 'Hata', error.message)
    }
  }

  const handleCreateProject = async (data: {
    name: string
    game_title: string
    project_path: string
  }) => {
    setIsLoading(true)
    try {
      const result = await window.api.invoke('project:create', {
        name: data.name,
        game_title: data.game_title,
        source_language: 'en',
        target_language: 'tr',
        project_path: data.project_path,
      }) as any

      if (result.success) {
        showToast('success', 'Proje oluşturuldu', data.name)
        setShowCreateModal(false)
        await openProject(result.project_path)
      } else {
        showToast('error', 'Hata', result.error)
      }
    } catch (error: any) {
      showToast('error', 'Hata', error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-900 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 mb-6">
            <span className="text-4xl">🎬</span>
          </div>
          <h1 className="text-4xl font-bold text-surface-100 mb-2">DubLab</h1>
          <p className="text-surface-400 text-lg">Oyun Dublaj Pipeline Yönetim Sistemi</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={isLoading}
            className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl
                       bg-primary-600 hover:bg-primary-500 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-3xl">➕</span>
            <span className="font-medium text-white">Yeni Proje</span>
          </button>

          <button
            onClick={handleOpenProject}
            disabled={isLoading}
            className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl
                       bg-surface-800 hover:bg-surface-700 border border-surface-700
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-3xl">📂</span>
            <span className="font-medium text-surface-200">Proje Aç</span>
          </button>
        </div>

        {recentProjects.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-surface-500 uppercase tracking-wider mb-3">
              Son Açılan Projeler
            </h2>
            <div className="space-y-2">
              {recentProjects.map((project, index) => (
                <button
                  key={index}
                  onClick={() => openProject(project.path)}
                  disabled={isLoading}
                  className="w-full flex items-center gap-4 p-4 rounded-lg
                             bg-surface-800/50 hover:bg-surface-800 border border-surface-700/50
                             transition-colors text-left group
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-10 h-10 rounded-lg bg-surface-700 flex items-center justify-center group-hover:bg-primary-600 transition-colors">
                    <span className="text-xl">🎮</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-surface-200 truncate">{project.name}</p>
                    <p className="text-sm text-surface-500 truncate">{project.game_title}</p>
                  </div>
                  <span className="text-surface-600 group-hover:text-surface-400 transition-colors">→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="fixed inset-0 bg-surface-900/80 flex items-center justify-center z-50">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-surface-400">Yükleniyor...</p>
            </div>
          </div>
        )}

        {showCreateModal && (
          <CreateProjectModal
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreateProject}
          />
        )}
      </div>
    </div>
  )
}

function CreateProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (data: { name: string; game_title: string; project_path: string }) => void
}) {
  const [name, setName] = useState('')
  const [gameTitle, setGameTitle] = useState('')
  const [projectPath, setProjectPath] = useState('')

  const handleSelectFolder = async () => {
    try {
      const result = await window.api.invoke('dialog:select-folder', {
        title: 'Proje Konumu Seç',
      }) as any

      if (result.success && result.path) setProjectPath(result.path)
    } catch (error) {
      console.error('Klasör seçilemedi:', error)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name && gameTitle && projectPath) {
      onCreate({ name, game_title: gameTitle, project_path: projectPath })
    }
  }

  const isValid = name.trim() !== '' && gameTitle.trim() !== '' && projectPath.trim() !== ''

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-surface-100">Yeni Proje Oluştur</h2>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-300 transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-400 mb-1.5">Proje Adı</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="ör: CyberPunk_TR" className="input" autoFocus />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-400 mb-1.5">Oyun Adı</label>
            <input type="text" value={gameTitle} onChange={e => setGameTitle(e.target.value)} placeholder="ör: Cyberpunk 2077" className="input" />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-400 mb-1.5">Proje Konumu</label>
            <div className="flex gap-2">
              <input type="text" value={projectPath} onChange={e => setProjectPath(e.target.value)} placeholder="Klasör seçin..." className="input flex-1" readOnly />
              <button type="button" onClick={handleSelectFolder} className="btn-secondary whitespace-nowrap">📂 Seç</button>
            </div>
            {projectPath && <p className="text-xs text-surface-500 mt-1.5">Proje şurada oluşturulacak: {projectPath}/{name}</p>}
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">İptal</button>
            <button type="submit" disabled={!isValid} className="btn-primary">Oluştur</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function MainLayout() {
  const { project, progress, currentPage, setCurrentPage, closeProject } = useApp()

  if (!project) return null

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'characters', label: 'Karakterler', icon: '🎭' },
    { id: 'artists', label: 'Sanatçılar', icon: '🎙️' },
    { id: 'translations', label: 'Çeviri Editörü', icon: '📝' },
    { id: 'files', label: 'Dosya Yönetimi', icon: '📂' },
    { id: 'history', label: 'İşlem Geçmişi', icon: '📋' },
    { id: 'health', label: 'Sağlık Kontrolü', icon: '🏥' },
  ]

  return (
    <div className="h-screen bg-surface-900 flex overflow-hidden">
      <aside className="w-sidebar bg-surface-850 border-r border-surface-700 flex flex-col min-h-0">
        <div className="h-topbar flex items-center gap-3 px-4 border-b border-surface-700">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <span className="text-sm">🎬</span>
          </div>
          <span className="font-semibold text-surface-200">DubLab</span>
        </div>

        <div className="p-4 border-b border-surface-700">
          <p className="font-medium text-surface-200 truncate">{project.name}</p>
          <p className="text-sm text-surface-500 truncate">{project.game_title}</p>
          {progress && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-surface-500 mb-1">
                <span>Genel İlerleme</span>
                <span>{progress.overall_percent}%</span>
              </div>
              <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full transition-all duration-300" style={{ width: `${progress.overall_percent}%` }} />
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 min-h-0 p-2 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                transition-colors
                ${currentPage === item.id
                  ? 'bg-primary-600/20 text-primary-400'
                  : 'text-surface-400 hover:bg-surface-800 hover:text-surface-200'
                }
              `}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-surface-700">
          <button
            onClick={() => setCurrentPage('settings')}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
              transition-colors
              ${currentPage === 'settings'
                ? 'bg-primary-600/20 text-primary-400'
                : 'text-surface-400 hover:bg-surface-800 hover:text-surface-200'
              }
            `}
          >
            <span className="text-lg">⚙️</span>
            <span className="font-medium">Ayarlar</span>
          </button>

          <button
            onClick={closeProject}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                       text-surface-500 hover:bg-surface-800 hover:text-surface-300 transition-colors"
          >
            <span className="text-lg">🚪</span>
            <span className="font-medium">Projeyi Kapat</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <header className="h-topbar flex items-center justify-between px-6 border-b border-surface-700 bg-surface-850">
          <h1 className="text-lg font-semibold text-surface-200">
            {navItems.find(i => i.id === currentPage)?.label || 'Ayarlar'}
          </h1>

          {progress && (
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-translation" />
                  <span className="text-surface-400">Çeviri</span>
                  <span className="text-surface-200 font-medium">{progress.translation_percent}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-recording" />
                  <span className="text-surface-400">Kayıt</span>
                  <span className="text-surface-200 font-medium">{progress.recording_percent}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-mixing" />
                  <span className="text-surface-400">Mix</span>
                  <span className="text-surface-200 font-medium">{progress.mixing_percent}%</span>
                </div>
              </div>
            </div>
          )}
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6">
          <PageContent />
        </div>
      </main>
    </div>
  )
}

function PageContent() {
  const { currentPage } = useApp()

  const pageComponents: Record<string, JSX.Element> = {
    dashboard: <DashboardPage />,
    characters: <CharactersPage />,
    artists: <ArtistsPage />,
    translations: <TranslationsPage />,
    files: <FilesPage />,
    history: <HistoryPage />,
    settings: <SettingsPage />,
    health: <HealthPage />,
  }

  return pageComponents[currentPage] || <PagePlaceholder title="Sayfa Bulunamadı" icon="❓" />
}

function DashboardPlaceholder() {
  const { progress } = useApp()

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ProgressCard title="Çeviri" value={progress?.translation_percent || 0} count={`${progress?.translated_count || 0} / ${progress?.total_files || 0}`} color="translation" />
        <ProgressCard title="Kayıt" value={progress?.recording_percent || 0} count={`${progress?.recorded_count || 0} / ${progress?.total_files || 0}`} color="recording" />
        <ProgressCard title="Mix" value={progress?.mixing_percent || 0} count={`${progress?.mixed_count || 0} / ${progress?.total_files || 0}`} color="mixing" />
      </div>

      <div className="card">
        <h3 className="text-surface-400 text-sm font-medium mb-3">Genel İlerleme</h3>
        <div className="flex items-center gap-4">
          <div className="flex-1 h-4 bg-surface-700 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full transition-all duration-500" style={{ width: `${progress?.overall_percent || 0}%` }} />
          </div>
          <span className="text-2xl font-bold text-surface-200">{progress?.overall_percent || 0}%</span>
        </div>
      </div>

      <div className="card text-center py-12">
        <span className="text-5xl mb-4 block">🚧</span>
        <h3 className="text-xl font-semibold text-surface-300 mb-2">Dashboard Geliştiriliyor</h3>
        <p className="text-surface-500">Bu alanda detaylı istatistikler, grafikler ve uyarılar görünecek.</p>
      </div>
    </div>
  )
}

function ProgressCard({
  title,
  value,
  count,
  color,
}: {
  title: string
  value: number
  count: string
  color: 'translation' | 'recording' | 'mixing'
}) {
  const colorClasses = {
    translation: 'from-primary-500 to-primary-600',
    recording: 'from-success-500 to-success-600',
    mixing: 'from-warning-500 to-warning-600',
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-surface-400 text-sm font-medium">{title}</h3>
        <span className="text-surface-500 text-sm">{count}</span>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-3xl font-bold text-surface-200">{value}%</span>
        <div className="flex-1 h-2 bg-surface-700 rounded-full overflow-hidden mb-2">
          <div className={`h-full rounded-full bg-gradient-to-r ${colorClasses[color]} transition-all duration-500`} style={{ width: `${value}%` }} />
        </div>
      </div>
    </div>
  )
}

function PagePlaceholder({ title, icon }: { title: string; icon: string }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <span className="text-6xl mb-4 block">{icon}</span>
        <h2 className="text-2xl font-semibold text-surface-300 mb-2">{title}</h2>
        <p className="text-surface-500">Bu sayfa bir sonraki seansta geliştirilecek.</p>
      </div>
    </div>
  )
}

function AppContent() {
  const { isProjectOpen } = useApp()

  return (
    <>
      {isProjectOpen ? <MainLayout /> : <WelcomeScreen />}
      <ToastContainer />
      <FileWatcherUI />
    </>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  )
}