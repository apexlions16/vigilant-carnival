import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../App'

interface CharWithFiles {
  id: string
  name: string
  priority: string
  total_files: number
  translated_count: number
  recorded_count: number
  mixed_count: number
}

interface AudioItem {
  id: string
  file_name: string
  original_path: string | null
  recording_path: string | null
  mixed_path: string | null
  original_exists: boolean
  recording_exists: boolean
  mixed_exists: boolean
  original_size: string | null
  recording_size: string | null
  mixed_size: string | null
  translation_status: string
}

type Tab = 'all' | 'originals' | 'recording' | 'mixed'
type ImportCat = 'originals' | 'recording' | 'mixed'

function catLabel(c: ImportCat): string {
  return { originals: 'Original', recording: 'Recording', mixed: 'Mixed' }[c]
}

export default function FilesPage() {
  const { project, showToast, refreshProgress } = useApp()

  const [chars, setChars] = useState<CharWithFiles[]>([])
  const [selChar, setSelChar] = useState<CharWithFiles | null>(null)
  const [files, setFiles] = useState<AudioItem[]>([])
  const [loadingChars, setLoadingChars] = useState(true)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [tab, setTab] = useState<Tab>('all')
  const [importing, setImporting] = useState(false)

  const loadChars = useCallback(async () => {
    if (!project) return
    setLoadingChars(true)
    try {
      const r = await window.api.invoke('character:list', project.id) as any
      if (r.success) {
        setChars(r.characters)
        if (r.characters.length > 0 && !selChar) setSelChar(r.characters[0])
      }
    } catch (e: any) {
      showToast('error', 'Hata', e.message)
    } finally {
      setLoadingChars(false)
    }
  }, [project])

  const loadFiles = useCallback(async () => {
    if (!selChar) {
      setFiles([])
      return
    }
    setLoadingFiles(true)
    try {
      const r = await window.api.invoke('audio:list', { character_id: selChar.id }) as any
      if (r.success) setFiles(r.audio_files)
    } catch (e: any) {
      showToast('error', 'Hata', e.message)
    } finally {
      setLoadingFiles(false)
    }
  }, [selChar])

  useEffect(() => { loadChars() }, [loadChars])
  useEffect(() => { loadFiles() }, [loadFiles])

  const doImport = async (cat: ImportCat) => {
    if (!project || !selChar) {
      showToast('warning', 'Uyarı', 'Önce karakter seçin.')
      return
    }

    try {
      const fr = await window.api.invoke('dialog:select-files', {
        title: `${catLabel(cat)} Ses Dosyaları Seç`,
        filters: [{ name: 'Ses Dosyaları', extensions: ['wav', 'mp3', 'ogg', 'flac'] }],
        multi: true,
      }) as any
      if (!fr.success || !fr.paths?.length) return

      setImporting(true)
      const ch: Record<ImportCat, string> = {
        originals: 'audio:import-originals',
        recording: 'audio:import-recording',
        mixed: 'audio:import-mixed',
      }

      const r = await window.api.invoke(ch[cat], {
        project_id: project.id,
        project_path: project.project_path,
        character_id: selChar.id,
        character_name: selChar.name,
        file_paths: fr.paths,
      }) as any

      if (r.success) {
        showToast('success', `${catLabel(cat)} Import`, 'Tamamlandı')
        await loadFiles()
        await loadChars()
        await refreshProgress()
      } else {
        showToast('error', 'Hata', r.error)
      }
    } catch (e: any) {
      showToast('error', 'Hata', e.message)
    } finally {
      setImporting(false)
    }
  }

  const openSystem = async (filePath: string | null) => {
    if (!filePath) {
      showToast('warning', 'Dosya yok', 'Bu kategori için dosya bulunamadı.')
      return
    }
    const r = await window.api.invoke('system:open-path', filePath) as any
    if (!r.success) showToast('error', 'Açılamadı', r.error)
  }

  const showInFolder = async (filePath: string | null) => {
    if (!filePath) {
      showToast('warning', 'Dosya yok', 'Bu kategori için dosya bulunamadı.')
      return
    }
    const r = await window.api.invoke('system:show-in-folder', filePath) as any
    if (!r.success) showToast('error', 'Gösterilemedi', r.error)
  }

  const filtered = files.filter(f => {
    if (tab === 'all') return true
    if (tab === 'originals') return f.original_exists
    if (tab === 'recording') return f.recording_exists
    if (tab === 'mixed') return f.mixed_exists
    return true
  })

  const oc = files.filter(f => f.original_exists).length
  const rc = files.filter(f => f.recording_exists).length
  const mc = files.filter(f => f.mixed_exists).length

  return (
    <div className="flex gap-6 h-full animate-fade-in">
      {/* Sol panel */}
      <div className="w-72 flex-shrink-0 flex flex-col">
        <h3 className="text-sm font-medium text-surface-400 mb-3">Karakterler</h3>

        {loadingChars ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chars.length === 0 ? (
          <div className="card text-center py-8">
            <span className="text-3xl mb-2 block">🎭</span>
            <p className="text-sm text-surface-500">Henüz karakter yok</p>
          </div>
        ) : (
          <div className="space-y-1 overflow-y-auto flex-1">
            {chars.map(c => (
              <button
                key={c.id}
                onClick={() => setSelChar(c)}
                className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                  selChar?.id === c.id
                    ? 'bg-primary-600/20 border border-primary-500/30'
                    : 'hover:bg-surface-800 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-surface-200 truncate">{c.name}</span>
                  <span className="text-xs text-surface-500">{c.total_files}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sağ panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selChar ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <span className="text-6xl mb-4 block">📂</span>
              <h3 className="text-xl font-semibold text-surface-300 mb-2">Karakter Seçin</h3>
              <p className="text-surface-500">Sol panelden bir karakter seçin.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-surface-200">{selChar.name}</h2>
                <p className="text-sm text-surface-500">{files.length} ses dosyası</p>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => doImport('originals')} disabled={importing} className="btn-secondary text-sm">📥 Original Ekle</button>
                <button onClick={() => doImport('recording')} disabled={importing} className="btn-secondary text-sm">🎙️ Recording Ekle</button>
                <button onClick={() => doImport('mixed')} disabled={importing} className="btn-secondary text-sm">🎛️ Mixed Ekle</button>
              </div>
            </div>

            <div className="flex items-center gap-1 mb-4 bg-surface-800 rounded-lg p-1 w-fit">
              {([
                ['all', 'Tümü', files.length],
                ['originals', 'Originals', oc],
                ['recording', 'Recording', rc],
                ['mixed', 'Mixed', mc],
              ] as [Tab, string, number][]).map(([k, l, n]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tab === k ? 'bg-primary-600 text-white' : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  {l} <span className={tab === k ? 'text-primary-200' : 'text-surface-500'}>{n}</span>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto">
              {loadingFiles ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="card text-center py-16">
                  <span className="text-5xl mb-4 block">🔇</span>
                  <h3 className="text-lg font-semibold text-surface-300 mb-2">Dosya bulunamadı</h3>
                </div>
              ) : (
                <div className="card p-0 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-surface-700 bg-surface-800">
                        <th className="text-left px-4 py-3 text-sm font-medium text-surface-400">Dosya</th>
                        <th className="text-center px-4 py-3 text-sm font-medium text-surface-400 w-72">Sistemde Aç</th>
                        <th className="text-center px-4 py-3 text-sm font-medium text-surface-400 w-28">Klasör</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(f => (
                        <tr key={f.id} className="border-b border-surface-700/30 hover:bg-surface-800/50 transition-colors">
                          <td className="px-4 py-2.5">
                            <span className="text-sm font-mono text-surface-300">{f.file_name}</span>
                          </td>

                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                className={`btn-secondary px-2 py-1 text-xs ${f.original_exists ? '' : 'opacity-30 pointer-events-none'}`}
                                onClick={() => openSystem(f.original_path)}
                              >
                                O
                              </button>
                              <button
                                className={`btn-secondary px-2 py-1 text-xs ${f.recording_exists ? '' : 'opacity-30 pointer-events-none'}`}
                                onClick={() => openSystem(f.recording_path)}
                              >
                                R
                              </button>
                              <button
                                className={`btn-secondary px-2 py-1 text-xs ${f.mixed_exists ? '' : 'opacity-30 pointer-events-none'}`}
                                onClick={() => openSystem(f.mixed_path)}
                              >
                                M
                              </button>
                            </div>
                          </td>

                          <td className="px-4 py-2.5 text-center">
                            <button
                              className="btn-ghost px-2 py-1 text-xs"
                              onClick={() => showInFolder(f.original_path || f.recording_path || f.mixed_path)}
                              title="Explorer’da göster"
                            >
                              📁
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {importing && (
                <div className="fixed inset-0 bg-surface-900/80 flex items-center justify-center z-50">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-surface-400">Import ediliyor...</p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}