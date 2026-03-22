import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../App'

interface ProjStats {
  total_characters: number
  total_artists: number
  total_files: number
  total_translations: number
}

function fileStamp() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${y}${m}${day}_${hh}${mm}`
}

function statusLabel(s: string): string {
  return { active: 'Aktif', paused: 'Beklemede', completed: 'Tamamlandı' }[s] || s
}
function statusBadge(s: string): string {
  return { active: 'badge-success', paused: 'badge-warning', completed: 'badge-primary' }[s] || 'badge bg-surface-600/30 text-surface-400'
}
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function SettingsPage() {
  const { project, showToast, theme, toggleTheme, closeProject, openProject } = useApp()

  const [stats, setStats] = useState<ProjStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editGame, setEditGame] = useState('')
  const [editStatus, setEditStatus] = useState('active')

  const [deleteShow, setDeleteShow] = useState(false)
  const [confirmText, setConfirmText] = useState('')

  // Paketleme UI state
  const [includeOriginals, setIncludeOriginals] = useState(true)
  const [includeRecording, setIncludeRecording] = useState(true)
  const [includeMixed, setIncludeMixed] = useState(true)
  const [packaging, setPackaging] = useState(false)
  const [lastPackMeta, setLastPackMeta] = useState<any>(null)

  const fixableDeleteOk = useMemo(() => {
    if (!project) return false
    return confirmText === project.name
  }, [confirmText, project])

  useEffect(() => {
    if (!project) return
    setEditName(project.name)
    setEditGame(project.game_title)
    setEditStatus(project.status || 'active')
  }, [project?.id])

  const loadStats = async () => {
    if (!project) return
    setLoadingStats(true)
    try {
      const r = (await window.api.invoke('project:get-stats', project.id)) as any
      if (r.success) setStats(r.stats)
    } catch {
      // ignore
    } finally {
      setLoadingStats(false)
    }
  }

  useEffect(() => {
    loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const saveProject = async () => {
    if (!project) return
    try {
      const r = (await window.api.invoke('project:update', {
        id: project.id,
        updates: { name: editName, game_title: editGame, status: editStatus },
      })) as any

      if (r.success) {
        showToast('success', 'Güncellendi', 'Proje bilgileri kaydedildi.')
        setEditing(false)
      } else {
        showToast('error', 'Hata', r.error)
      }
    } catch (e: any) {
      showToast('error', 'Hata', e.message)
    }
  }

  const deleteProject = async (delFiles: boolean) => {
    if (!project) return
    try {
      const r = (await window.api.invoke('project:delete', {
        id: project.id,
        delete_files: delFiles,
        project_path: project.project_path,
      })) as any

      if (r.success) {
        showToast('success', 'Proje silindi')
        setDeleteShow(false)
        await closeProject()
      } else {
        showToast('error', 'Hata', r.error)
      }
    } catch (e: any) {
      showToast('error', 'Hata', e.message)
    }
  }

  // ✅ Paket oluştur
  const createPackage = async () => {
    if (!project) return
    setPackaging(true)
    try {
      const save = (await window.api.invoke('dialog:save-file', {
        title: 'Proje Paketini Kaydet',
        default_name: `${project.name}_${fileStamp()}.dubpack`,
        filters: [
          { name: 'DubLab Paket', extensions: ['dubpack'] },
          { name: 'Zip', extensions: ['zip'] },
        ],
      })) as any

      if (!save.success || !save.path) {
        setPackaging(false)
        return
      }

      const r = (await window.api.invoke('package:create', {
        project_path: project.project_path,
        output_path: save.path,
        include_originals: includeOriginals,
        include_recording: includeRecording,
        include_mixed: includeMixed,
      })) as any

      if (r.success) {
        setLastPackMeta(r.meta || null)
        showToast('success', 'Paket oluşturuldu', save.path)
      } else {
        showToast('error', 'Paketleme hatası', r.error)
      }
    } catch (e: any) {
      showToast('error', 'Paketleme hatası', e.message)
    } finally {
      setPackaging(false)
    }
  }

  // ✅ Paket yükle
  const loadPackage = async () => {
    if (!project) return

    try {
      // Önce projeyi kapat (backend load tarafı DB açıkken istemiyor)
      await closeProject()

      const filePick = (await window.api.invoke('dialog:select-files', {
        title: 'Paket Dosyası Seç',
        filters: [
          { name: 'DubLab Paket', extensions: ['dubpack'] },
          { name: 'Zip', extensions: ['zip'] },
        ],
        multi: false,
      })) as any

      if (!filePick.success || !filePick.paths?.length) {
        return
      }

      const folderPick = (await window.api.invoke('dialog:select-folder', {
        title: 'Paket Nereye Çıkarılsın?',
      })) as any

      if (!folderPick.success || !folderPick.path) {
        return
      }

      const r = (await window.api.invoke('package:load', {
        pack_path: filePick.paths[0],
        destination_root: folderPick.path,
      })) as any

      if (r.success) {
        showToast('success', 'Paket yüklendi', r.project_path)
        await openProject(r.project_path)
      } else {
        showToast('error', 'Paket yükleme hatası', r.error)
      }
    } catch (e: any) {
      showToast('error', 'Paket yükleme hatası', e.message)
    }
  }

  if (!project) return null

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl">
      <Section title="Görünüm" icon="🎨">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-surface-200 font-medium">Tema</p>
            <p className="text-sm text-surface-500">İstersen değiştirebilirsin</p>
          </div>
          <button onClick={toggleTheme} className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-surface-700 hover:bg-surface-600 transition-colors">
            <span className="text-xl">{theme === 'dark' ? '🌙' : '☀️'}</span>
            <span className="text-surface-200 font-medium">{theme === 'dark' ? 'Karanlık' : 'Aydınlık'}</span>
          </button>
        </div>
      </Section>

      <Section title="Proje Bilgileri" icon="📂">
        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-surface-400 mb-1.5">Proje Adı</label>
              <input className="input" value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-400 mb-1.5">Oyun Adı</label>
              <input className="input" value={editGame} onChange={e => setEditGame(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-400 mb-1.5">Durum</label>
              <select className="input" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                <option value="active">Aktif</option>
                <option value="paused">Beklemede</option>
                <option value="completed">Tamamlandı</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={saveProject} className="btn-primary">Kaydet</button>
              <button onClick={() => { setEditing(false); setEditName(project.name); setEditGame(project.game_title); setEditStatus(project.status) }} className="btn-secondary">
                İptal
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <InfoRow label="Proje Adı" value={project.name} />
            <InfoRow label="Oyun Adı" value={project.game_title} />
            <InfoRow label="Kaynak Dil" value={project.source_language.toUpperCase()} />
            <InfoRow label="Hedef Dil" value={project.target_language.toUpperCase()} />
            <InfoRow label="Durum" value={<span className={`badge ${statusBadge(project.status)}`}>{statusLabel(project.status)}</span>} />
            <InfoRow label="Yol" value={project.project_path} mono />
            <InfoRow label="Oluşturulma" value={formatDate(project.created_at)} />
            <div className="pt-2">
              <button onClick={() => setEditing(true)} className="btn-secondary">✏️ Düzenle</button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Proje Paketleme (.dubpack)" icon="📦">
        <div className="space-y-4">
          <div className="text-sm text-surface-500">
            Projeyi tek dosya halinde paketleyip başka bilgisayara gönderebilirsin.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="card flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={includeOriginals} onChange={e => setIncludeOriginals(e.target.checked)} />
              <div>
                <div className="text-surface-200 font-medium">Originals</div>
                <div className="text-xs text-surface-500">Orijinal sesler</div>
              </div>
            </label>

            <label className="card flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={includeRecording} onChange={e => setIncludeRecording(e.target.checked)} />
              <div>
                <div className="text-surface-200 font-medium">Recording</div>
                <div className="text-xs text-surface-500">Kayıtlar</div>
              </div>
            </label>

            <label className="card flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={includeMixed} onChange={e => setIncludeMixed(e.target.checked)} />
              <div>
                <div className="text-surface-200 font-medium">Mixed</div>
                <div className="text-xs text-surface-500">Mixlenmiş sesler</div>
              </div>
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={createPackage} disabled={packaging} className="btn-primary">
              {packaging ? 'Paketleniyor...' : '📦 Paket Oluştur'}
            </button>

            <button onClick={loadPackage} className="btn-secondary">
              📥 Paket Yükle
            </button>
          </div>

          {lastPackMeta && (
            <div className="bg-surface-900/40 border border-surface-700 rounded-lg p-4">
              <div className="text-surface-200 font-medium mb-2">Son Paket Meta</div>
              <div className="text-xs text-surface-500 space-y-1">
                <div>Proje: <span className="text-surface-300">{lastPackMeta.project_name}</span></div>
                <div>Tarih: <span className="text-surface-300">{lastPackMeta.packaged_at}</span></div>
                <div>Checksum (sha256): <span className="font-mono text-surface-300">{lastPackMeta.checksum_sha256}</span></div>
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="İstatistikler" icon="📊">
        {loadingStats ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-8 h-8 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-4">
            <StatCard icon="🎭" label="Karakter" value={stats.total_characters} />
            <StatCard icon="🎙️" label="Sanatçı" value={stats.total_artists} />
            <StatCard icon="🔊" label="Ses Dosyası" value={stats.total_files} />
            <StatCard icon="📝" label="Çeviri" value={stats.total_translations} />
          </div>
        ) : (
          <div className="text-sm text-surface-500">İstatistikler yüklenemedi.</div>
        )}
      </Section>

      <Section title="Klavye Kısayolları" icon="⌨️">
        <div className="space-y-2">
          <ShortRow keys={['Tab']} desc="Çeviri editöründe sonraki hücre" />
          <ShortRow keys={['Enter']} desc="Çeviri editöründe kaydet" />
          <ShortRow keys={['Escape']} desc="İptal / Modal kapat" />
        </div>
      </Section>

      <Section title="Hakkında" icon="ℹ️">
        <InfoRow label="Uygulama" value="DubLab" />
        <InfoRow label="Versiyon" value="1.0.0" />
        <InfoRow label="Platform" value="Electron + React + SQLite" />
      </Section>

      <div className="border border-danger-500/30 rounded-xl overflow-hidden">
        <div className="px-6 py-4 bg-danger-500/5 border-b border-danger-500/30">
          <h3 className="text-lg font-semibold text-danger-400">⚠️ Tehlikeli Bölge</h3>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-surface-200 font-medium">Projeyi Sil</p>
              <p className="text-sm text-surface-500">Bu işlem geri alınamaz.</p>
            </div>
            <button onClick={() => setDeleteShow(true)} className="btn-danger">🗑️ Projeyi Sil</button>
          </div>
        </div>
      </div>

      {deleteShow && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-800 rounded-xl border border-danger-500/30 w-full max-w-md shadow-2xl animate-scale-in">
            <div className="px-6 py-4 border-b border-surface-700">
              <h2 className="text-lg font-semibold text-danger-400">⚠️ Projeyi Sil</h2>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-surface-300">
                <strong>"{project.name}"</strong> silinecek. Bu işlem geri alınamaz.
              </p>

              <div className="bg-danger-500/10 border border-danger-500/20 rounded-lg p-3">
                <p className="text-sm text-danger-400">Silinecekler:</p>
                <ul className="text-sm text-surface-400 space-y-1 pl-4">
                  <li>• Tüm karakter, sanatçı, ses kayıtları</li>
                  <li>• Tüm çeviri verisi</li>
                  <li>• Veritabanı dosyası</li>
                </ul>
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-400 mb-1.5">
                  Onay için proje adını yazın: <strong>{project.name}</strong>
                </label>
                <input className="input" value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder={project.name} />
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button onClick={() => deleteProject(true)} disabled={!fixableDeleteOk} className="btn-danger w-full">
                  🗑️ Projeyi ve Dosyaları Sil
                </button>
                <button onClick={() => deleteProject(false)} disabled={!fixableDeleteOk} className="btn-secondary w-full text-danger-400">
                  Sadece Kaydı Sil
                </button>
                <button onClick={() => { setDeleteShow(false); setConfirmText('') }} className="btn-secondary w-full">
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="h-8" />
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-surface-200 mb-4 flex items-center gap-2">
        <span>{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  )
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-surface-500">{label}</span>
      {typeof value === 'string' ? (
        <span className={`text-sm text-surface-300 ${mono ? 'font-mono text-xs' : ''}`}>{value}</span>
      ) : (
        value
      )}
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="bg-surface-700/50 rounded-lg p-4 flex items-center gap-3">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-2xl font-bold text-surface-200">{value.toLocaleString()}</p>
        <p className="text-xs text-surface-500">{label}</p>
      </div>
    </div>
  )
}

function ShortRow({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-surface-400">{desc}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <span key={i}>
            {i > 0 && <span className="text-surface-600 mx-1">+</span>}
            <kbd className="px-2 py-1 bg-surface-700 rounded text-xs text-surface-300 font-mono border border-surface-600">{k}</kbd>
          </span>
        ))}
      </div>
    </div>
  )
}