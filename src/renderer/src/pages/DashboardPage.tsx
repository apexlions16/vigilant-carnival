import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../App'
import ProgressRing from '../components/ProgressRing'

type ProjectStats = {
  total_characters: number
  total_artists: number
  total_files: number
  total_translations: number
}

type ProjectProgress = {
  total_files: number
  translated_count: number
  recorded_count: number
  mixed_count: number
  translation_percent: number
  recording_percent: number
  mixing_percent: number
  overall_percent: number
}

type ProjectWarnings = {
  unassigned_characters: number
  untranslated_lines: number
  unrecorded_lines: number
}

type CharacterRow = {
  id: string
  name: string
  priority: string
  artist_name: string | null
  total_files: number
  translated_count: number
  recorded_count: number
  mixed_count: number
}

type ArtistWorkload = {
  artist_id: string
  artist_name: string
  assigned_characters: number
  total_lines: number
  recorded_lines: number
  remaining_lines: number
  progress_percent: number
}

type AuditLogItem = {
  id: string
  icon: string
  description: string
  formatted_date: string
}

function pct(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0
}

function overallCharPct(c: CharacterRow): number {
  if (c.total_files <= 0) return 0
  const t = pct(c.translated_count, c.total_files)
  const r = pct(c.recorded_count, c.total_files)
  const m = pct(c.mixed_count, c.total_files)
  return Math.round((t + r + m) / 3)
}

export default function DashboardPage() {
  const { project, progress, refreshProgress, showToast, setCurrentPage } = useApp()

  const [stats, setStats] = useState<ProjectStats | null>(null)
  const [warnings, setWarnings] = useState<ProjectWarnings | null>(null)
  const [characters, setCharacters] = useState<CharacterRow[]>([])
  const [workload, setWorkload] = useState<ArtistWorkload[]>([])
  const [recent, setRecent] = useState<AuditLogItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = async () => {
    if (!project) return
    setLoading(true)
    try {
      // 1) progress + stats + warnings
      const ps = (await window.api.invoke('project:get-stats', project.id)) as any
      if (ps?.success) {
        setStats(ps.stats || null)
        setWarnings(ps.warnings || null)
        // progress state AppContext’te; ama backend aynı anda döndürüyor, gene de refresh alalım:
        await refreshProgress()
      }

      // 2) characters
      const cl = (await window.api.invoke('character:list', project.id)) as any
      if (cl?.success) setCharacters(cl.characters || [])

      // 3) artist workload
      const wl = (await window.api.invoke('artist:workload', project.id)) as any
      if (wl?.success) setWorkload(wl.workload || [])

      // 4) recent audit
      const al = (await window.api.invoke('audit:list', {
        project_id: project.id,
        limit: 8,
        offset: 0,
      })) as any
      if (al?.success) setRecent((al.logs || []).map((x: any) => ({
        id: x.id,
        icon: x.icon || '📋',
        description: x.description,
        formatted_date: x.formatted_date,
      })))
    } catch (e: any) {
      showToast('error', 'Dashboard hatası', e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const attentionCharacters = useMemo(() => {
    const arr = [...characters]
    arr.sort((a, b) => overallCharPct(a) - overallCharPct(b))
    return arr.slice(0, 8)
  }, [characters])

  const topWorkload = useMemo(() => {
    const arr = [...workload]
    arr.sort((a, b) => b.total_lines - a.total_lines)
    return arr.slice(0, 6)
  }, [workload])

  const maxLines = useMemo(() => {
    const m = Math.max(...workload.map(w => w.total_lines), 1)
    return m
  }, [workload])

  if (!project) return null

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-surface-500">Proje</div>
          <div className="text-2xl font-semibold text-surface-200">{project.name}</div>
          <div className="text-sm text-surface-500">{project.game_title}</div>
        </div>

        <div className="flex gap-2">
          <button onClick={loadAll} className="btn-secondary" disabled={loading}>
            {loading ? 'Yükleniyor...' : '🔄 Yenile'}
          </button>
        </div>
      </div>

      {/* Progress Rings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="text-sm font-medium text-surface-400 mb-4">İlerleme</div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ProgressRing
              value={progress?.overall_percent ?? 0}
              label="Genel"
              color="#6366f1"
              subLabel={`${progress?.total_files ?? 0} satır`}
            />
            <div className="space-y-4">
              <ProgressRing value={progress?.translation_percent ?? 0} label="Çeviri" color="#818cf8" size={74} stroke={9} />
              <ProgressRing value={progress?.recording_percent ?? 0} label="Recording" color="#22c55e" size={74} stroke={9} />
              <ProgressRing value={progress?.mixing_percent ?? 0} label="Mixed" color="#eab308" size={74} stroke={9} />
            </div>
          </div>
        </div>

        {/* Summary / Warnings */}
        <div className="card">
          <div className="text-sm font-medium text-surface-400 mb-4">Özet & Uyarılar</div>

          <div className="grid grid-cols-2 gap-3">
            <SummaryCard icon="🎭" label="Karakter" value={stats?.total_characters ?? 0} />
            <SummaryCard icon="🎙️" label="Sanatçı" value={stats?.total_artists ?? 0} />
            <SummaryCard icon="🔊" label="Toplam Ses" value={stats?.total_files ?? 0} />
            <SummaryCard icon="📝" label="Çevrilen" value={stats?.total_translations ?? 0} />
          </div>

          <div className="mt-5 border-t border-surface-700 pt-4 space-y-2">
            <WarningRow
              icon="⚠️"
              label="Atanmamış karakter"
              value={warnings?.unassigned_characters ?? 0}
              onGo={() => setCurrentPage('characters')}
            />
            <WarningRow
              icon="📝"
              label="Çevirisi eksik satır"
              value={warnings?.untranslated_lines ?? 0}
              onGo={() => setCurrentPage('translations')}
            />
            <WarningRow
              icon="🎙️"
              label="Kaydı eksik satır"
              value={warnings?.unrecorded_lines ?? 0}
              onGo={() => setCurrentPage('files')}
            />
          </div>
        </div>
      </div>

      {/* Characters needing attention + Workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-surface-400">Dikkat Gerektiren Karakterler</div>
            <button onClick={() => setCurrentPage('characters')} className="btn-ghost text-sm">
              Tümü →
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-surface-500">Yükleniyor...</div>
          ) : attentionCharacters.length === 0 ? (
            <div className="text-sm text-surface-500">Karakter bulunamadı.</div>
          ) : (
            <div className="space-y-3">
              {attentionCharacters.map((c) => {
                const o = overallCharPct(c)
                return (
                  <div key={c.id} className="bg-surface-900/40 border border-surface-700 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-surface-200 font-medium truncate">{c.name}</div>
                        <div className="text-xs text-surface-500">
                          {c.artist_name ? `🎙️ ${c.artist_name}` : '⚠️ Atanmamış'} • {c.total_files} satır
                        </div>
                      </div>
                      <div className="text-surface-200 font-semibold">{o}%</div>
                    </div>
                    <div className="mt-2 h-2 bg-surface-700 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${o}%` }} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-2xs text-surface-500">
                      <div>Çeviri: <span className="text-surface-300">{pct(c.translated_count, c.total_files)}%</span></div>
                      <div>Kayıt: <span className="text-surface-300">{pct(c.recorded_count, c.total_files)}%</span></div>
                      <div>Mix: <span className="text-surface-300">{pct(c.mixed_count, c.total_files)}%</span></div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-surface-400">Sanatçı İş Yükü</div>
            <button onClick={() => setCurrentPage('artists')} className="btn-ghost text-sm">
              Tümü →
            </button>
          </div>

          {loading ? (
            <div className="text-sm text-surface-500">Yükleniyor...</div>
          ) : topWorkload.length === 0 ? (
            <div className="text-sm text-surface-500">Sanatçı verisi yok.</div>
          ) : (
            <div className="space-y-3">
              {topWorkload.map((w) => {
                const bar = Math.round((w.total_lines / maxLines) * 100)
                const done = w.total_lines > 0 ? Math.round((w.recorded_lines / w.total_lines) * 100) : 0
                return (
                  <div key={w.artist_id} className="bg-surface-900/40 border border-surface-700 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-surface-200 font-medium">{w.artist_name}</div>
                      <div className="text-sm text-surface-400">{w.recorded_lines}/{w.total_lines} • {done}%</div>
                    </div>
                    <div className="mt-2 h-2 bg-surface-700 rounded-full overflow-hidden relative">
                      <div className="h-full bg-surface-600" style={{ width: `${bar}%` }} />
                      <div className="h-full bg-success-500 absolute top-0 left-0" style={{ width: `${Math.round((w.recorded_lines / maxLines) * 100)}%` }} />
                    </div>
                    <div className="mt-2 text-xs text-surface-500">
                      Karakter: <span className="text-surface-300">{w.assigned_characters}</span> • Kalan: <span className="text-surface-300">{w.remaining_lines}</span>
                    </div>
                  </div>
                )
              })}
              <div className="flex items-center gap-4 pt-2 text-xs text-surface-500">
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-success-500" /> Kaydedilmiş</div>
                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-surface-600" /> Toplam</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-medium text-surface-400">Son Aktiviteler</div>
          <button onClick={() => setCurrentPage('history')} className="btn-ghost text-sm">
            Geçmiş →
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-surface-500">Yükleniyor...</div>
        ) : recent.length === 0 ? (
          <div className="text-sm text-surface-500">Henüz aktivite yok.</div>
        ) : (
          <div className="space-y-2">
            {recent.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-900/40 border border-surface-700">
                <div className="text-lg">{r.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-surface-300 truncate">{r.description}</div>
                  <div className="text-2xs text-surface-500">{r.formatted_date}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="bg-surface-900/40 border border-surface-700 rounded-lg p-3">
      <div className="flex items-center gap-3">
        <div className="text-2xl">{icon}</div>
        <div>
          <div className="text-xl font-bold text-surface-200">{value.toLocaleString()}</div>
          <div className="text-xs text-surface-500">{label}</div>
        </div>
      </div>
    </div>
  )
}

function WarningRow({
  icon,
  label,
  value,
  onGo,
}: {
  icon: string
  label: string
  value: number
  onGo: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <span>{icon}</span>
        <span className="text-sm text-surface-400 truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${value > 0 ? 'text-warning-400' : 'text-surface-500'}`}>
          {value}
        </span>
        <button onClick={onGo} className="btn-ghost text-sm">
          Git
        </button>
      </div>
    </div>
  )
}