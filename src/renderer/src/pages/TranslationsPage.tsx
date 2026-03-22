import { useState, useEffect, useCallback, useRef } from 'react'
import { useApp } from '../App'

interface TRow {
  id: string; sound_id: string; character_id: string; character_name: string
  original_text: string; translated_text: string; translation_status: string
  recording_status: string; mixing_status: string; original_path: string | null
}

interface TStats { total: number; translated: number; has_original: number; empty: number; reviewed: number; percent: number }
interface Pag { page: number; page_size: number; total: number; total_pages: number }
interface CharOpt { id: string; name: string }
interface PrevChange { sound_id: string; character_name: string; field: string; old_value: string; new_value: string }

const sLabel: Record<string, string> = { empty: 'Boş', has_original: 'Orijinal Var', translated: 'Çevrildi', reviewed: 'İncelendi' }
const sBadge: Record<string, string> = { empty: 'badge bg-surface-600/30 text-surface-400', has_original: 'badge-warning', translated: 'badge-success', reviewed: 'badge-primary' }
const sIcon: Record<string, string> = { empty: '⬜', has_original: '📝', translated: '✅', reviewed: '✔️' }

export default function TranslationsPage() {
  const { project, showToast, refreshProgress } = useApp()
  const [rows, setRows] = useState<TRow[]>([])
  const [stats, setStats] = useState<TStats | null>(null)
  const [pag, setPag] = useState<Pag>({ page: 1, page_size: 50, total: 0, total_pages: 0 })
  const [chars, setChars] = useState<CharOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [charF, setCharF] = useState('all')
  const [statusF, setStatusF] = useState('all')
  const [search, setSearch] = useState('')
  const [curPage, setCurPage] = useState(1)
  const [editCell, setEditCell] = useState<{ rowId: string; field: 'original_text' | 'translated_text' } | null>(null)
  const [editVal, setEditVal] = useState('')
  const editRef = useRef<HTMLTextAreaElement>(null)
  const [showExport, setShowExport] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [preview, setPreview] = useState<{
    file_path: string; file_name: string; total_rows: number; matched_rows: number
    unmatched_rows: number; changes_count: number; changes: PrevChange[]; unmatched_ids: string[]
  } | null>(null)

  const loadT = useCallback(async () => {
    if (!project) return
    setLoading(true)
    try {
      const r = await window.api.invoke('translation:list', {
        project_id: project.id,
        character_id: charF === 'all' ? null : charF,
        status_filter: statusF === 'all' ? null : statusF,
        search_query: search || null,
        page: curPage, page_size: 50,
      }) as any
      if (r.success) { setRows(r.translations); setStats(r.stats); setPag(r.pagination) }
      else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
    finally { setLoading(false) }
  }, [project, charF, statusF, search, curPage])

  const loadC = useCallback(async () => {
    if (!project) return
    try {
      const r = await window.api.invoke('character:list', project.id) as any
      if (r.success) setChars(r.characters.map((c: any) => ({ id: c.id, name: c.name })))
    } catch {}
  }, [project])

  useEffect(() => { loadC() }, [loadC])
  useEffect(() => { loadT() }, [loadT])
  useEffect(() => { setCurPage(1) }, [charF, statusF, search])

  const startEdit = (rowId: string, field: 'original_text' | 'translated_text', val: string) => {
    setEditCell({ rowId, field }); setEditVal(val)
    setTimeout(() => editRef.current?.focus(), 50)
  }

  const saveEdit = async () => {
    if (!editCell || !project) return
    try {
      const r = await window.api.invoke('translation:update', {
        audio_file_id: editCell.rowId, project_id: project.id,
        field: editCell.field, value: editVal,
      }) as any
      if (r.success) {
        setRows(prev => prev.map(row => row.id !== editCell.rowId ? row : { ...row, [editCell.field]: editVal, translation_status: r.audio_file.translation_status }))
        await refreshProgress()
      } else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
    setEditCell(null); setEditVal('')
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setEditCell(null); setEditVal('') }
    else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit() }
    else if (e.key === 'Tab') {
      e.preventDefault(); saveEdit()
      const idx = rows.findIndex(r => r.id === editCell?.rowId)
      if (idx === -1) return
      if (editCell?.field === 'original_text') startEdit(rows[idx].id, 'translated_text', rows[idx].translated_text)
      else if (idx < rows.length - 1) startEdit(rows[idx + 1].id, 'original_text', rows[idx + 1].original_text)
    }
  }

  const doExport = async (opts: { character_ids: string[] | null; separate_sheets: boolean }) => {
    if (!project) return
    try {
      const sr = await window.api.invoke('dialog:save-file', {
        title: 'Excel Kaydet', default_name: `${project.name}_ceviriler.xlsx`,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      }) as any
      if (!sr.success || !sr.path) return
      const r = await window.api.invoke('translation:export-excel', {
        project_id: project.id, output_path: sr.path,
        character_ids: opts.character_ids, separate_sheets: opts.separate_sheets,
      }) as any
      if (r.success) { showToast('success', 'Export tamamlandı', `${r.total_rows} satır.`); setShowExport(false) }
      else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
  }

  const doImportPreview = async () => {
    if (!project) return
    try {
      const fr = await window.api.invoke('dialog:select-files', {
        title: 'Excel Seç', filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }], multi: false,
      }) as any
      if (!fr.success || !fr.paths?.length) return
      const r = await window.api.invoke('translation:preview-excel', { project_id: project.id, file_path: fr.paths[0] }) as any
      if (r.success) { setPreview({ file_path: fr.paths[0], ...r.preview }); setShowImport(true) }
      else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
  }

  const doImportApply = async () => {
    if (!project || !preview) return
    try {
      const r = await window.api.invoke('translation:apply-excel', { project_id: project.id, file_path: preview.file_path }) as any
      if (r.success) {
        showToast('success', 'Import tamamlandı', `${r.result.updated} güncellenen, ${r.result.unchanged} değişmeyen.`)
        setShowImport(false); setPreview(null); await loadT(); await refreshProgress()
      } else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
  }

  const pageNums = (cur: number, tot: number): number[] => {
    if (tot <= 7) return Array.from({ length: tot }, (_, i) => i + 1)
    const p: number[] = [1]
    if (cur > 3) p.push(-1)
    for (let i = Math.max(2, cur - 1); i <= Math.min(tot - 1, cur + 1); i++) p.push(i)
    if (cur < tot - 2) p.push(-1)
    if (tot > 1) p.push(tot)
    return p
  }

  return (
    <div className="space-y-4 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500">🔍</span>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ses ID, metin ara..." className="input pl-10" />
          </div>
          <select value={charF} onChange={e => setCharF(e.target.value)} className="input w-auto">
            <option value="all">Tüm Karakterler</option>
            {chars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={statusF} onChange={e => setStatusF(e.target.value)} className="input w-auto">
            <option value="all">Tüm Durumlar</option>
            <option value="empty">⬜ Boş</option>
            <option value="has_original">📝 Orijinal Var</option>
            <option value="translated">✅ Çevrildi</option>
            <option value="reviewed">✔️ İncelendi</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowExport(true)} className="btn-secondary">📤 Excel Export</button>
          <button onClick={doImportPreview} className="btn-secondary">📥 Excel Import</button>
        </div>
      </div>

      {stats && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-surface-500">Toplam: <strong className="text-surface-300">{stats.total}</strong></span>
          <span className="text-surface-500">Çevrildi: <strong className="text-success-400">{stats.translated}</strong></span>
          <span className="text-surface-500">Orijinal: <strong className="text-warning-400">{stats.has_original}</strong></span>
          <span className="text-surface-500">Boş: <strong className="text-surface-400">{stats.empty}</strong></span>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-32 h-2 bg-surface-700 rounded-full overflow-hidden"><div className="h-full bg-success-500 rounded-full transition-all" style={{ width: `${stats.percent}%` }} /></div>
            <span className="text-surface-300 font-medium">{stats.percent}%</span>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="card text-center py-16"><span className="text-6xl mb-4 block">📝</span><h3 className="text-xl font-semibold text-surface-300 mb-2">Çeviri verisi yok</h3><p className="text-surface-500">Önce Dosya Yönetimi'nden ses dosyası import edin.</p></div>
        ) : (
          <div className="card p-0 overflow-auto h-full">
            <table className="w-full">
              <thead className="sticky top-0 z-10"><tr className="bg-surface-800 border-b border-surface-700">
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-400 w-12">#</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-400 w-44">Ses ID</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-400 w-28">Karakter</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-400">English</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-surface-400">Türkçe</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-surface-400 w-28">Durum</th>
              </tr></thead>
              <tbody>{rows.map((row, i) => {
                const num = (pag.page - 1) * pag.page_size + i + 1
                const eO = editCell?.rowId === row.id && editCell?.field === 'original_text'
                const eT = editCell?.rowId === row.id && editCell?.field === 'translated_text'
                return (
                  <tr key={row.id} className="border-b border-surface-700/50 hover:bg-surface-800/50 transition-colors">
                    <td className="px-4 py-2 text-sm text-surface-600">{num}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {row.original_path && <button className="text-surface-500 hover:text-surface-300 flex-shrink-0">🔊</button>}
                        <span className="text-sm font-mono text-surface-300 truncate">{row.sound_id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2"><span className="text-sm text-surface-400 truncate block">{row.character_name}</span></td>
                    <td className="px-4 py-2">
                      {eO ? (
                        <textarea ref={editRef} value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={onKey} onBlur={saveEdit}
                          rows={2} className="w-full px-2 py-1 bg-surface-900 border border-primary-500 rounded text-surface-200 text-sm resize-none focus:outline-none" />
                      ) : (
                        <div onClick={() => startEdit(row.id, 'original_text', row.original_text)}
                          className="text-sm text-surface-300 cursor-text min-h-[28px] px-2 py-1 rounded hover:bg-surface-700/50 transition-colors">
                          {row.original_text || <span className="text-surface-600 italic">Tıklayarak ekle...</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {eT ? (
                        <textarea ref={editRef} value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={onKey} onBlur={saveEdit}
                          rows={2} className="w-full px-2 py-1 bg-surface-900 border border-primary-500 rounded text-surface-200 text-sm resize-none focus:outline-none" />
                      ) : (
                        <div onClick={() => startEdit(row.id, 'translated_text', row.translated_text)}
                          className="text-sm text-surface-300 cursor-text min-h-[28px] px-2 py-1 rounded hover:bg-surface-700/50 transition-colors">
                          {row.translated_text || <span className="text-surface-600 italic">Çeviri ekle...</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-center"><span className={sBadge[row.translation_status] || sBadge.empty}>{sIcon[row.translation_status] || '⬜'} {sLabel[row.translation_status] || 'Boş'}</span></td>
                  </tr>
                )
              })}</tbody>
            </table>
          </div>
        )}
      </div>

      {pag.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-surface-500">{pag.total} satırdan {(pag.page - 1) * pag.page_size + 1}—{Math.min(pag.page * pag.page_size, pag.total)} gösteriliyor</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurPage(p => Math.max(1, p - 1))} disabled={pag.page <= 1} className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-30">◀</button>
            {pageNums(pag.page, pag.total_pages).map((n, i) => n === -1 ? <span key={`e${i}`} className="px-2 text-surface-500">...</span> : (
              <button key={n} onClick={() => setCurPage(n)} className={`px-3 py-1.5 rounded text-sm ${n === pag.page ? 'bg-primary-600 text-white' : 'text-surface-400 hover:bg-surface-700'}`}>{n}</button>
            ))}
            <button onClick={() => setCurPage(p => Math.min(pag.total_pages, p + 1))} disabled={pag.page >= pag.total_pages} className="btn-ghost px-3 py-1.5 text-sm disabled:opacity-30">▶</button>
          </div>
        </div>
      )}

      {showExport && <ExportModal chars={chars} onClose={() => setShowExport(false)} onExport={doExport} />}
      {showImport && preview && <ImportModal preview={preview} onClose={() => { setShowImport(false); setPreview(null) }} onApply={doImportApply} />}
    </div>
  )
}

function ExportModal({ chars, onClose, onExport }: { chars: CharOpt[]; onClose: () => void; onExport: (o: { character_ids: string[] | null; separate_sheets: boolean }) => void }) {
  const [sel, setSel] = useState<string[]>([])
  const [all, setAll] = useState(true)
  const [sep, setSep] = useState(false)
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-surface-100">📤 Excel Export</h2>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-300">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <label className="flex items-center gap-2 mb-3">
            <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} className="rounded border-surface-600" />
            <span className="text-sm text-surface-300">Tüm karakterler</span>
          </label>
          {!all && <div className="max-h-48 overflow-y-auto space-y-1 pl-6">{chars.map(c => (
            <label key={c.id} className="flex items-center gap-2">
              <input type="checkbox" checked={sel.includes(c.id)} onChange={() => setSel(p => p.includes(c.id) ? p.filter(x => x !== c.id) : [...p, c.id])} className="rounded border-surface-600" />
              <span className="text-sm text-surface-400">{c.name}</span>
            </label>
          ))}</div>}
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={sep} onChange={e => setSep(e.target.checked)} className="rounded border-surface-600" />
            <span className="text-sm text-surface-300">Her karakter ayrı sheet</span>
          </label>
          <div className="bg-surface-700/50 rounded-lg p-3">
            <p className="text-xs text-surface-500 mb-2">Sütunlar:</p>
            <div className="flex flex-wrap gap-2">
              {['Ses ID', 'Karakter', 'English', 'Türkçe', 'Durum'].map(s => <span key={s} className="badge bg-surface-600 text-surface-300">{s}</span>)}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={onClose} className="btn-secondary">İptal</button>
            <button onClick={() => onExport({ character_ids: all ? null : sel, separate_sheets: sep })} className="btn-primary">Export Et</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ImportModal({ preview, onClose, onApply }: {
  preview: { file_name: string; total_rows: number; matched_rows: number; unmatched_rows: number; changes_count: number; changes: PrevChange[]; unmatched_ids: string[] }
  onClose: () => void; onApply: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-xl border border-surface-700 w-full max-w-2xl shadow-2xl animate-scale-in max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-surface-100">📥 Import Önizleme</h2>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-300">✕</button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="bg-surface-700/50 rounded-lg p-4">
            <p className="text-surface-300 font-medium">📄 {preview.file_name}</p>
            <div className="grid grid-cols-3 gap-4 mt-3">
              <div><p className="text-2xl font-bold text-surface-200">{preview.total_rows}</p><p className="text-xs text-surface-500">Toplam</p></div>
              <div><p className="text-2xl font-bold text-success-400">{preview.matched_rows}</p><p className="text-xs text-surface-500">Eşleşen</p></div>
              <div><p className="text-2xl font-bold text-warning-400">{preview.unmatched_rows}</p><p className="text-xs text-surface-500">Eşleşmeyen</p></div>
            </div>
          </div>
          {preview.changes.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-surface-400 mb-2">Değişiklikler ({preview.changes_count})</h3>
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-sm"><thead><tr className="border-b border-surface-700">
                  <th className="text-left px-3 py-2 text-surface-500">Ses ID</th><th className="text-left px-3 py-2 text-surface-500">Alan</th>
                  <th className="text-left px-3 py-2 text-surface-500">Eski</th><th className="text-left px-3 py-2 text-surface-500">Yeni</th>
                </tr></thead><tbody>{preview.changes.slice(0, 50).map((c, i) => (
                  <tr key={i} className="border-b border-surface-700/30">
                    <td className="px-3 py-2 font-mono text-surface-400">{c.sound_id}</td>
                    <td className="px-3 py-2 text-surface-500">{c.field === 'original_text' ? 'English' : 'Türkçe'}</td>
                    <td className="px-3 py-2 text-danger-400 truncate max-w-[150px]">{c.old_value || '(boş)'}</td>
                    <td className="px-3 py-2 text-success-400 truncate max-w-[150px]">{c.new_value || '(boş)'}</td>
                  </tr>
                ))}</tbody></table>
                {preview.changes.length > 50 && <p className="text-sm text-surface-500 text-center py-2">... ve {preview.changes.length - 50} daha</p>}
              </div>
            </div>
          )}
          {preview.unmatched_ids.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-warning-400 mb-2">⚠️ Eşleşmeyen ({preview.unmatched_ids.length})</h3>
              <div className="bg-warning-500/10 border border-warning-500/20 rounded-lg p-3">
                <div className="flex flex-wrap gap-1">
                  {preview.unmatched_ids.slice(0, 20).map((id, i) => <span key={i} className="text-xs font-mono bg-surface-700 px-2 py-0.5 rounded text-surface-400">{id}</span>)}
                  {preview.unmatched_ids.length > 20 && <span className="text-xs text-surface-500">+{preview.unmatched_ids.length - 20}</span>}
                </div>
              </div>
            </div>
          )}
          {preview.changes_count === 0 && <div className="text-center py-6"><span className="text-4xl mb-3 block">✅</span><p className="text-surface-400">Veriler güncel.</p></div>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-700">
          <button onClick={onClose} className="btn-secondary">İptal</button>
          <button onClick={onApply} disabled={preview.changes_count === 0} className="btn-primary">
            {preview.changes_count > 0 ? `${preview.changes_count} Değişikliği Uygula` : 'Değişiklik Yok'}
          </button>
        </div>
      </div>
    </div>
  )
}