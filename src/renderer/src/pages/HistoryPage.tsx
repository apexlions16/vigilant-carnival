import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../App'

interface AuditLogItem {
  id: string
  timestamp: string
  action_type: string
  entity_type: string
  entity_id: string
  description: string
  old_value: string | null
  new_value: string | null
  is_undone: boolean
  formatted_date: string
  date_group: string
  action_label: string
  entity_label: string
  icon: string
  can_undo: boolean
  old_value_parsed: any
  new_value_parsed: any
}

interface AuditStats {
  total: number
  by_action: Record<string, number>
  by_entity: Record<string, number>
  undone_count: number
  today_count: number
  this_week_count: number
}

interface FilterOption {
  value: string
  label: string
}

export default function HistoryPage() {
  const { project, showToast, refreshProgress } = useApp()

  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [grouped, setGrouped] = useState<Record<string, AuditLogItem[]>>({})
  const [stats, setStats] = useState<AuditStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [offset, setOffset] = useState(0)

  const [actionFilter, setActionFilter] = useState('all')
  const [entityFilter, setEntityFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [filterOptions, setFilterOptions] = useState<{
    action_types: FilterOption[]
    entity_types: FilterOption[]
  }>({
    action_types: [],
    entity_types: [],
  })

  const [detailLog, setDetailLog] = useState<AuditLogItem | null>(null)
  const [undoingLog, setUndoingLog] = useState<AuditLogItem | null>(null)

  const loadLogs = useCallback(async () => {
    if (!project) return
    setIsLoading(true)

    try {
      const result = await window.api.invoke('audit:list', {
        project_id: project.id,
        limit: 100,
        offset: 0,
        action_type: actionFilter === 'all' ? null : actionFilter,
        entity_type: entityFilter === 'all' ? null : entityFilter,
        search_query: searchQuery || null,
      }) as any

      if (result.success) {
        setLogs(result.logs)
        setGrouped(result.grouped)
        setHasMore(result.pagination.has_more)
        setOffset(result.pagination.offset + result.pagination.limit)
      } else {
        showToast('error', 'Hata', result.error)
      }
    } catch (error: any) {
      showToast('error', 'Hata', error.message)
    } finally {
      setIsLoading(false)
    }
  }, [project, actionFilter, entityFilter, searchQuery])

  const loadMore = async () => {
    if (!project) return

    try {
      const result = await window.api.invoke('audit:list', {
        project_id: project.id,
        limit: 100,
        offset,
        action_type: actionFilter === 'all' ? null : actionFilter,
        entity_type: entityFilter === 'all' ? null : entityFilter,
        search_query: searchQuery || null,
      }) as any

      if (result.success) {
        setLogs(prev => [...prev, ...result.logs])

        const nextGrouped: Record<string, AuditLogItem[]> = { ...grouped }
        for (const log of result.logs) {
          if (!nextGrouped[log.date_group]) nextGrouped[log.date_group] = []
          nextGrouped[log.date_group].push(log)
        }
        setGrouped(nextGrouped)
        setHasMore(result.pagination.has_more)
        setOffset(result.pagination.offset + result.pagination.limit)
      }
    } catch (error: any) {
      showToast('error', 'Hata', error.message)
    }
  }

  const loadStats = useCallback(async () => {
    if (!project) return
    try {
      const result = await window.api.invoke('audit:stats', project.id) as any
      if (result.success) {
        setStats(result.stats)
      }
    } catch {
      // sessiz geç
    }
  }, [project])

  const loadFilterOptions = useCallback(async () => {
    try {
      const result = await window.api.invoke('audit:filter-options') as any
      if (result.success) {
        setFilterOptions(result.options)
      }
    } catch {
      // sessiz geç
    }
  }, [])

  useEffect(() => {
    loadLogs()
    loadStats()
    loadFilterOptions()
  }, [loadLogs, loadStats, loadFilterOptions])

  useEffect(() => {
    setOffset(0)
  }, [actionFilter, entityFilter, searchQuery])

  const handleUndo = async () => {
    if (!project || !undoingLog) return

    try {
      const result = await window.api.invoke('audit:undo', {
        log_id: undoingLog.id,
        project_id: project.id,
      }) as any

      if (result.success) {
        showToast('success', 'Geri alındı', result.message)
        setUndoingLog(null)
        await loadLogs()
        await loadStats()
        await refreshProgress()
      } else {
        showToast('error', 'Geri alma başarısız', result.error)
      }
    } catch (error: any) {
      showToast('error', 'Hata', error.message)
    }
  }

  const groupOrder = ['Bugün', 'Dün', 'Bu Hafta', 'Bu Ay', 'Daha Eski']
  const sortedGroups = groupOrder.filter(g => grouped[g] && grouped[g].length > 0)

  return (
    <div className="space-y-6 animate-fade-in">
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="card flex items-center gap-3">
            <span className="text-2xl">📋</span>
            <div>
              <p className="text-2xl font-bold text-surface-200">{stats.total}</p>
              <p className="text-xs text-surface-500">Toplam İşlem</p>
            </div>
          </div>

          <div className="card flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <div>
              <p className="text-2xl font-bold text-primary-400">{stats.today_count}</p>
              <p className="text-xs text-surface-500">Bugün</p>
            </div>
          </div>

          <div className="card flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <p className="text-2xl font-bold text-info-400">{stats.this_week_count}</p>
              <p className="text-xs text-surface-500">Bu Hafta</p>
            </div>
          </div>

          <div className="card flex items-center gap-3">
            <span className="text-2xl">↩️</span>
            <div>
              <p className="text-2xl font-bold text-warning-400">{stats.undone_count}</p>
              <p className="text-xs text-surface-500">Geri Alınan</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="İşlem açıklamasında ara..."
            className="input pl-10"
          />
        </div>

        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="input w-auto"
        >
          {filterOptions.action_types.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <select
          value={entityFilter}
          onChange={e => setEntityFilter(e.target.value)}
          className="input w-auto"
        >
          {filterOptions.entity_types.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="card text-center py-16">
          <span className="text-6xl mb-4 block">📋</span>
          <h3 className="text-xl font-semibold text-surface-300 mb-2">İşlem geçmişi boş</h3>
          <p className="text-surface-500">
            {actionFilter !== 'all' || entityFilter !== 'all' || searchQuery
              ? 'Filtrelere uygun kayıt bulunamadı.'
              : 'Proje üzerinde yapılan işlemler burada listelenecek.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedGroups.map(groupName => (
            <div key={groupName}>
              <h3 className="text-sm font-medium text-surface-500 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-surface-600" />
                {groupName}
                <span className="text-surface-600">({grouped[groupName].length})</span>
              </h3>

              <div className="space-y-1">
                {grouped[groupName].map(log => (
                  <LogEntry
                    key={log.id}
                    log={log}
                    onViewDetail={() => setDetailLog(log)}
                    onUndo={() => setUndoingLog(log)}
                  />
                ))}
              </div>
            </div>
          ))}

          {hasMore && (
            <div className="text-center py-4">
              <button onClick={loadMore} className="btn-secondary">
                Daha Fazla Yükle
              </button>
            </div>
          )}
        </div>
      )}

      {detailLog && (
        <LogDetailModal
          log={detailLog}
          onClose={() => setDetailLog(null)}
          onUndo={() => {
            setDetailLog(null)
            setUndoingLog(detailLog)
          }}
        />
      )}

      {undoingLog && (
        <UndoConfirmModal
          log={undoingLog}
          onClose={() => setUndoingLog(null)}
          onConfirm={handleUndo}
        />
      )}
    </div>
  )
}

function LogEntry({
  log,
  onViewDetail,
  onUndo,
}: {
  log: AuditLogItem
  onViewDetail: () => void
  onUndo: () => void
}) {
  return (
    <div
      onClick={onViewDetail}
      className={`
        flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer
        transition-colors group
        ${log.is_undone
          ? 'bg-surface-800/30 opacity-60'
          : 'bg-surface-800/50 hover:bg-surface-800'}
      `}
    >
      <span className="text-xl flex-shrink-0">{log.icon}</span>

      <div className="flex-1 min-w-0">
        <p className={`text-sm ${log.is_undone ? 'text-surface-500 line-through' : 'text-surface-300'}`}>
          {log.description}
        </p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-2xs text-surface-500">{log.formatted_date}</span>
          <span className={`badge ${entityBadge(log.entity_type)}`}>
            {log.entity_label}
          </span>
          {log.is_undone && (
            <span className="badge bg-warning-500/20 text-warning-400">
              ↩️ Geri alındı
            </span>
          )}
        </div>
      </div>

      {log.can_undo && !log.is_undone && (
        <button
          onClick={e => {
            e.stopPropagation()
            onUndo()
          }}
          className="btn-ghost p-2 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
          title="Geri Al"
        >
          ↩️
        </button>
      )}
    </div>
  )
}

function LogDetailModal({
  log,
  onClose,
  onUndo,
}: {
  log: AuditLogItem
  onClose: () => void
  onUndo: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-xl border border-surface-700 w-full max-w-lg shadow-2xl animate-scale-in max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-surface-100">
            {log.icon} İşlem Detayı
          </h2>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-300">
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-surface-500 mb-1">İşlem Tipi</p>
              <span className="badge-primary">{log.action_label}</span>
            </div>
            <div>
              <p className="text-xs text-surface-500 mb-1">Varlık Tipi</p>
              <span className={`badge ${entityBadge(log.entity_type)}`}>{log.entity_label}</span>
            </div>
            <div>
              <p className="text-xs text-surface-500 mb-1">Tarih</p>
              <p className="text-surface-300 text-sm">{log.formatted_date}</p>
            </div>
            <div>
              <p className="text-xs text-surface-500 mb-1">Durum</p>
              {log.is_undone ? (
                <span className="badge-warning">↩️ Geri alınmış</span>
              ) : (
                <span className="badge-success">✓ Aktif</span>
              )}
            </div>
          </div>

          <div>
            <p className="text-xs text-surface-500 mb-1">Açıklama</p>
            <p className="text-surface-300">{log.description}</p>
          </div>

          {log.old_value_parsed && (
            <div>
              <p className="text-xs text-surface-500 mb-1">Önceki Değer</p>
              <pre className="bg-surface-900 rounded-lg p-3 text-xs text-surface-400 overflow-auto max-h-40">
                {JSON.stringify(log.old_value_parsed, null, 2)}
              </pre>
            </div>
          )}

          {log.new_value_parsed && (
            <div>
              <p className="text-xs text-surface-500 mb-1">Yeni Değer</p>
              <pre className="bg-surface-900 rounded-lg p-3 text-xs text-surface-400 overflow-auto max-h-40">
                {JSON.stringify(log.new_value_parsed, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <p className="text-xs text-surface-500 mb-1">Kayıt ID</p>
            <p className="text-xs font-mono text-surface-500">{log.entity_id}</p>
          </div>
        </div>

        <div className="flex justify-between px-6 py-4 border-t border-surface-700">
          <div>
            {log.can_undo && !log.is_undone && (
              <button onClick={onUndo} className="btn-secondary">
                ↩️ Geri Al
              </button>
            )}
          </div>
          <button onClick={onClose} className="btn-secondary">Kapat</button>
        </div>
      </div>
    </div>
  )
}

function UndoConfirmModal({
  log,
  onClose,
  onConfirm,
}: {
  log: AuditLogItem
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-xl border border-warning-500/30 w-full max-w-md shadow-2xl animate-scale-in">
        <div className="px-6 py-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-warning-400">↩️ Geri Al</h2>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-surface-300">Bu işlem geri alınacak:</p>

          <div className="bg-surface-700/50 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">{log.icon}</span>
              <span className="font-medium text-surface-200">{log.action_label}</span>
            </div>
            <p className="text-sm text-surface-400">{log.description}</p>
            <p className="text-xs text-surface-500 mt-2">{log.formatted_date}</p>
          </div>

          <p className="text-sm text-surface-500">
            İşlem mümkünse önceki duruma döndürülecek ve bu geri alma da geçmişe yazılacak.
          </p>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary">İptal</button>
            <button onClick={onConfirm} className="btn-primary">↩️ Geri Al</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function entityBadge(entityType: string): string {
  return {
    project: 'bg-info-500/20 text-info-400',
    character: 'bg-primary-500/20 text-primary-300',
    voice_artist: 'bg-success-500/20 text-success-400',
    audio_file: 'bg-warning-500/20 text-warning-400',
    translation: 'bg-purple-500/20 text-purple-400',
  }[entityType] || 'bg-surface-600/30 text-surface-400'
}