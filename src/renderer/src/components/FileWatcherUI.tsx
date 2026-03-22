import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../App'

type CatLower = 'originals' | 'recording' | 'mixed'

type WatchEvent =
  | {
      type: 'added'
      category: CatLower
      character_name: string
      file_name: string
      file_path?: string
      message?: string
      needs_confirmation?: boolean
    }
  | {
      type: 'deleted'
      category: CatLower
      character_name: string
      file_name: string
      file_path?: string
      message?: string
      needs_confirmation: boolean
    }
  | {
      type: 'moved'
      category: CatLower         // destination category
      from_category: CatLower
      from_character: string
      to_character: string
      file_name: string
      file_path: string
      existing_record?: boolean
      translation_info?: {
        original_text: string | null
        translated_text: string | null
        has_recording: boolean
        has_mixed: boolean
      }
      message?: string
      needs_confirmation: boolean
    }

function catLabel(c: CatLower) {
  if (c === 'originals') return 'Originals'
  if (c === 'recording') return 'Recording'
  return 'Mixed'
}

function moveRuleKey(e: WatchEvent & { type: 'moved' }) {
  return `${e.from_category}|${e.category}|${e.from_character}→${e.to_character}`
}

function deleteRuleKey(e: WatchEvent & { type: 'deleted' }) {
  return `${e.category}|${e.character_name}`
}

export default function FileWatcherUI() {
  const { isProjectOpen, showToast } = useApp()

  const [watcherActive, setWatcherActive] = useState(false)
  const [recent, setRecent] = useState<any[]>([])
  const [queue, setQueue] = useState<WatchEvent[]>([])

  // “Bir daha sorma” kuralları:
  const [moveRules, setMoveRules] = useState<Record<string, { move_all: boolean }>>({})
  const [deleteRules, setDeleteRules] = useState<Record<string, { action: 'mark_missing' | 'delete_record' }>>({})

  const current = queue.length > 0 ? queue[0] : null

  const title = useMemo(() => {
    if (!current) return ''
    if (current.type === 'moved') return '🔄 Dosya Taşıma Algılandı'
    if (current.type === 'deleted') return '🗑️ Dosya Silindi'
    return '📁 Dosya Değişikliği'
  }, [current])

  const pop = () => setQueue((prev) => prev.slice(1))

  // Event dinleme
  useEffect(() => {
    if (!isProjectOpen) {
      setWatcherActive(false)
      setRecent([])
      setQueue([])
      return
    }

    const offEvent = window.api.on('file-watcher:event', async (data: any) => {
      setRecent((prev) => [data, ...prev].slice(0, 6))

      // yalnızca onay gerektirenleri sıraya al
      if (data?.needs_confirmation) {
        const ev = data as WatchEvent

        // Rule varsa otomatik uygula
        if (ev.type === 'moved') {
          const key = moveRuleKey(ev)
          const rule = moveRules[key]
          if (rule) {
            await applyMove(ev, rule.move_all, false)
            return
          }
        }

        if (ev.type === 'deleted') {
          const key = deleteRuleKey(ev)
          const rule = deleteRules[key]
          if (rule) {
            await applyDelete(ev, rule.action, false)
            return
          }
        }

        setQueue((prev) => [...prev, ev])
      } else {
        // sadece bilgilendirme toast (added vb.)
        if (data?.type === 'added') {
          showToast('info', 'Yeni dosya', `${data.file_name} • ${data.character_name} • ${catLabel(data.category)}`)
        }
      }
    })

    const offStatus = window.api.on('file-watcher:status', (data: any) => {
      if (typeof data?.active === 'boolean') setWatcherActive(data.active)
    })

    const offError = window.api.on('file-watcher:error', (data: any) => {
      showToast('error', 'File Watcher Hatası', data?.message || 'Bilinmeyen hata')
    })

    ;(async () => {
      try {
        const s = (await window.api.invoke('file-watcher:status')) as any
        if (typeof s?.active === 'boolean') setWatcherActive(s.active)
      } catch {}
    })()

    return () => {
      offEvent?.()
      offStatus?.()
      offError?.()
    }
    // moveRules/deleteRules değişince handler rebind olmasın diye deliberately deps boş:
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProjectOpen])

  // Move uygula
  const applyMove = async (ev: Extract<WatchEvent, { type: 'moved' }>, moveAll: boolean, closeAfter: boolean = true) => {
    try {
      const r = (await window.api.invoke('file-watcher:confirm-move', {
        file_name: ev.file_name,
        from_character: ev.from_character,
        to_character: ev.to_character,
        category: ev.category,
        from_category: ev.from_category,
        move_all: moveAll,
        new_file_path: ev.file_path,
      })) as any

      if (r?.success) {
        showToast('success', 'Taşıma uygulandı', moveAll ? 'Tüm verilerle taşındı.' : 'Sadece bu kategori yolu güncellendi.')
      } else {
        showToast('error', 'Taşıma başarısız', r?.error || 'Bilinmeyen hata')
      }
    } catch (e: any) {
      showToast('error', 'Taşıma hatası', e.message)
    } finally {
      if (closeAfter) pop()
    }
  }

  // Delete uygula
  const applyDelete = async (ev: Extract<WatchEvent, { type: 'deleted' }>, action: 'mark_missing' | 'delete_record', closeAfter: boolean = true) => {
    try {
      const r = (await window.api.invoke('file-watcher:confirm-delete', {
        file_name: ev.file_name,
        character_name: ev.character_name,
        category: ev.category,
        action,
      })) as any

      if (r?.success) {
        showToast('success', 'Silme işlendi', action === 'mark_missing' ? 'DB’de path temizlendi.' : 'Kayıt silindi (yalnız originals için).')
      } else {
        showToast('error', 'Silme başarısız', r?.error || 'Bilinmeyen hata')
      }
    } catch (e: any) {
      showToast('error', 'Silme hatası', e.message)
    } finally {
      if (closeAfter) pop()
    }
  }

  return (
    <>
      {/* Sol alt: watcher durum + son olaylar */}
      {isProjectOpen && (
        <div className="fixed bottom-4 left-4 z-50">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-surface-700 bg-surface-850/90 backdrop-blur">
            <span className={`w-2 h-2 rounded-full ${watcherActive ? 'bg-success-500' : 'bg-surface-600'}`} />
            <span className="text-xs text-surface-300">
              {watcherActive ? 'File Watcher: Aktif' : 'File Watcher: Kapalı'}
            </span>
            {queue.length > 0 && (
              <span className="ml-2 badge bg-warning-500/20 text-warning-400">
                {queue.length} bekleyen
              </span>
            )}
          </div>

          {recent.length > 0 && (
            <div className="mt-2 space-y-2 max-w-[440px]">
              {recent.slice(0, 3).map((e: any, i: number) => (
                <div
                  key={`${e.type}-${e.file_name}-${i}`}
                  className="px-3 py-2 rounded-lg border border-surface-700 bg-surface-850/80 backdrop-blur"
                >
                  <div className="text-xs text-surface-500">
                    {String(e.type).toUpperCase()} • {catLabel(e.category)}
                  </div>
                  <div className="text-sm text-surface-200">
                    {e.message || `${e.file_name}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: sıradaki onay */}
      {current && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-surface-800 rounded-xl border border-surface-700 w-full max-w-2xl shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
              <h2 className="text-lg font-semibold text-surface-100">{title}</h2>
              <button onClick={pop} className="text-surface-500 hover:text-surface-300">✕</button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-surface-900/50 border border-surface-700 rounded-lg p-4">
                <div className="text-sm text-surface-300">
                  <div>
                    <span className="text-surface-500">Dosya:</span>{' '}
                    <span className="font-mono text-surface-200">{(current as any).file_name}</span>
                  </div>

                  {'category' in current && (
                    <div className="mt-1">
                      <span className="text-surface-500">Kategori:</span>{' '}
                      <span className="text-surface-200">{catLabel((current as any).category)}</span>
                    </div>
                  )}

                  {current.type === 'moved' && (
                    <>
                      <div className="mt-2">
                        <span className="text-surface-500">Taşıma:</span>{' '}
                        <span className="text-surface-200">{current.from_character}</span>
                        <span className="text-surface-500"> → </span>
                        <span className="text-surface-200">{current.to_character}</span>
                      </div>
                      <div className="mt-1 text-xs text-surface-500">
                        {catLabel(current.from_category)} → {catLabel(current.category)}
                      </div>

                      {current.translation_info && (
                        <div className="mt-2 text-xs text-surface-500">
                          Çeviri: {current.translation_info.translated_text ? 'var' : 'yok'} •
                          Recording: {current.translation_info.has_recording ? 'var' : 'yok'} •
                          Mixed: {current.translation_info.has_mixed ? 'var' : 'yok'}
                        </div>
                      )}
                    </>
                  )}

                  {current.type === 'deleted' && (
                    <div className="mt-2">
                      <span className="text-surface-500">Karakter:</span>{' '}
                      <span className="text-surface-200">{current.character_name}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* MOVE UI */}
              {current.type === 'moved' && (
                <MoveActions
                  event={current}
                  onClose={pop}
                  onApply={async (moveAll, remember) => {
                    if (remember) {
                      const key = moveRuleKey(current)
                      setMoveRules(prev => ({ ...prev, [key]: { move_all: moveAll } }))
                    }
                    await applyMove(current, moveAll, true)
                  }}
                />
              )}

              {/* DELETE UI */}
              {current.type === 'deleted' && (
                <DeleteActions
                  event={current}
                  onClose={pop}
                  onApply={async (action, remember) => {
                    if (remember) {
                      const key = deleteRuleKey(current)
                      setDeleteRules(prev => ({ ...prev, [key]: { action } }))
                    }
                    await applyDelete(current, action, true)
                  }}
                />
              )}

              {/* fallback */}
              {current.type !== 'moved' && current.type !== 'deleted' && (
                <div className="flex justify-end">
                  <button className="btn-secondary" onClick={pop}>Kapat</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function MoveActions({
  event,
  onClose,
  onApply,
}: {
  event: Extract<WatchEvent, { type: 'moved' }>
  onClose: () => void
  onApply: (moveAll: boolean, remember: boolean) => Promise<void>
}) {
  const [remember, setRemember] = useState(false)

  return (
    <div className="space-y-3">
      <div className="bg-warning-500/10 border border-warning-500/20 rounded-lg p-3 text-sm text-surface-400">
        Bu taşıma işlemi veritabanını güncelleyecek. İstersen aynı yöndeki taşımalarda tekrar sormamasını seçebilirsin.
      </div>

      <label className="flex items-center gap-2 text-sm text-surface-300">
        <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
        Bu yön için bir daha sorma (apply-to-all)
      </label>

      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-secondary">İptal</button>
        <button onClick={() => onApply(false, remember)} className="btn-secondary">
          Sadece Bu Kategori Yolunu Güncelle
        </button>
        <button onClick={() => onApply(true, remember)} className="btn-primary">
          Tüm Verilerle Taşı (Önerilen)
        </button>
      </div>
    </div>
  )
}

function DeleteActions({
  event,
  onClose,
  onApply,
}: {
  event: Extract<WatchEvent, { type: 'deleted' }>
  onClose: () => void
  onApply: (action: 'mark_missing' | 'delete_record', remember: boolean) => Promise<void>
}) {
  const [remember, setRemember] = useState(false)

  return (
    <div className="space-y-3">
      <div className="bg-surface-900/40 border border-surface-700 rounded-lg p-3 text-sm text-surface-400">
        Önerilen: <span className="text-surface-200 font-medium">“DB’de path temizle”</span>. Böylece kayıt/çeviri korunur.
        <div className="text-xs text-surface-500 mt-1">
          Not: “Kayıt sil” seçeneği sadece <span className="font-mono">Originals</span> silindiyse tüm kaydı kaldırır. Recording/Mixed için güvenlik gereği sadece path temizlenir.
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-surface-300">
        <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />
        Bu karakter+kategori için bir daha sorma
      </label>

      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="btn-secondary">İptal</button>
        <button onClick={() => onApply('mark_missing', remember)} className="btn-primary">
          DB’de Path Temizle (Önerilen)
        </button>
        <button onClick={() => onApply('delete_record', remember)} className="btn-danger">
          Kayıt Sil
        </button>
      </div>
    </div>
  )
}