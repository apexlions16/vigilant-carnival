import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../App'

interface ArtistItem {
  id: string; name: string; email: string | null; phone: string | null; notes: string | null
  assigned_characters: number; assigned_character_names: string[]
  total_lines: number; recorded_lines: number; remaining_lines: number; progress_percent: number
}

export default function ArtistsPage() {
  const { project, showToast } = useApp()
  const [artists, setArtists] = useState<ArtistItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<ArtistItem | null>(null)
  const [deleting, setDeleting] = useState<ArtistItem | null>(null)
  const [viewing, setViewing] = useState<ArtistItem | null>(null)

  const load = useCallback(async () => {
    if (!project) return
    setIsLoading(true)
    try {
      const r = await window.api.invoke('artist:list', project.id) as any
      if (r.success) setArtists(r.artists)
      else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
    finally { setIsLoading(false) }
  }, [project])

  useEffect(() => { load() }, [load])

  const handleCreate = async (d: { name: string; email: string; phone: string; notes: string }) => {
    if (!project) return
    try {
      const r = await window.api.invoke('artist:create', { project_id: project.id, name: d.name, email: d.email || null, phone: d.phone || null, notes: d.notes || null }) as any
      if (r.success) { showToast('success', 'Eklendi', `"${d.name}" eklendi.`); setShowCreate(false); await load() }
      else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
  }

  const handleUpdate = async (d: { name: string; email: string; phone: string; notes: string }) => {
    if (!project || !editing) return
    try {
      const r = await window.api.invoke('artist:update', { id: editing.id, project_id: project.id, updates: { name: d.name, email: d.email || null, phone: d.phone || null, notes: d.notes || null } }) as any
      if (r.success) { showToast('success', 'Güncellendi'); setEditing(null); await load() }
      else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
  }

  const handleDelete = async () => {
    if (!project || !deleting) return
    try {
      const r = await window.api.invoke('artist:delete', { id: deleting.id, project_id: project.id }) as any
      if (r.success) { showToast('success', 'Silindi', `"${deleting.name}" silindi.`); setDeleting(null); await load() }
      else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
  }

  const filtered = artists.filter(a => {
    if (!search) return true
    const q = search.toLowerCase()
    return a.name.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q) || a.assigned_character_names.some(n => n.toLowerCase().includes(q))
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500">🔍</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Sanatçı ara..." className="input pl-10" />
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">➕ Yeni Sanatçı</button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card flex items-center gap-3"><span className="text-2xl">🎙️</span><div><p className="text-2xl font-bold text-surface-200">{artists.length}</p><p className="text-xs text-surface-500">Toplam Sanatçı</p></div></div>
        <div className="card flex items-center gap-3"><span className="text-2xl">🔊</span><div><p className="text-2xl font-bold text-surface-200">{artists.reduce((s, a) => s + a.total_lines, 0)}</p><p className="text-xs text-surface-500">Toplam Satır</p></div></div>
        <div className="card flex items-center gap-3"><span className="text-2xl">✅</span><div><p className="text-2xl font-bold text-success-400">{artists.reduce((s, a) => s + a.recorded_lines, 0)}</p><p className="text-xs text-surface-500">Kaydedilmiş</p></div></div>
      </div>

      {artists.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-medium text-surface-400 mb-4">İş Yükü Dağılımı</h3>
          <div className="space-y-3">
            {artists.sort((a, b) => b.total_lines - a.total_lines).map(a => {
              const max = Math.max(...artists.map(x => x.total_lines), 1)
              return (
                <div key={a.id} className="flex items-center gap-3">
                  <span className="text-sm text-surface-300 w-32 truncate">{a.name}</span>
                  <div className="flex-1 h-6 bg-surface-700 rounded overflow-hidden relative">
                    <div className="h-full bg-surface-600 rounded transition-all duration-300" style={{ width: `${(a.total_lines / max) * 100}%` }} />
                    <div className="h-full bg-success-500 rounded absolute top-0 left-0 transition-all duration-300" style={{ width: `${a.total_lines > 0 ? (a.recorded_lines / max) * 100 : 0}%` }} />
                  </div>
                  <span className="text-sm text-surface-400 w-24 text-right">{a.recorded_lines}/{a.total_lines}</span>
                  <span className="text-sm font-medium text-surface-300 w-12 text-right">{a.progress_percent}%</span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-surface-700">
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-success-500" /><span className="text-xs text-surface-500">Kaydedilmiş</span></div>
            <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-surface-600" /><span className="text-xs text-surface-500">Kalan</span></div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <span className="text-6xl mb-4 block">🎙️</span>
          <h3 className="text-xl font-semibold text-surface-300 mb-2">{artists.length > 0 ? 'Sonuç bulunamadı' : 'Henüz sanatçı yok'}</h3>
          <p className="text-surface-500 mb-6">{artists.length > 0 ? 'Arama kriterlerini değiştirin.' : 'Sanatçı ekleyerek başlayın.'}</p>
          {artists.length === 0 && <button onClick={() => setShowCreate(true)} className="btn-primary">➕ İlk Sanatçıyı Ekle</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(a => (
            <div key={a.id} className="card-hover group" onClick={() => setViewing(a)}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-surface-700 flex items-center justify-center text-2xl">🎙️</div>
                  <div><h3 className="font-semibold text-surface-200">{a.name}</h3>{a.email && <p className="text-sm text-surface-500">{a.email}</p>}</div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setEditing(a)} className="btn-ghost p-1.5 text-sm">✏️</button>
                  <button onClick={() => setDeleting(a)} className="btn-ghost p-1.5 text-sm text-danger-400">🗑️</button>
                </div>
              </div>
              <div className="mb-3">
                {a.assigned_characters > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {a.assigned_character_names.slice(0, 4).map((n, i) => <span key={i} className="badge bg-surface-700 text-surface-300">🎭 {n}</span>)}
                    {a.assigned_character_names.length > 4 && <span className="badge bg-surface-700 text-surface-400">+{a.assigned_character_names.length - 4}</span>}
                  </div>
                ) : <span className="text-sm text-surface-500">Karakter atanmamış</span>}
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex justify-between text-xs text-surface-500 mb-1"><span>{a.recorded_lines} / {a.total_lines}</span><span>{a.progress_percent}%</span></div>
                  <div className="h-2 bg-surface-700 rounded-full overflow-hidden"><div className="h-full bg-success-500 rounded-full transition-all duration-300" style={{ width: `${a.progress_percent}%` }} /></div>
                </div>
              </div>
              {a.phone && <div className="mt-3 pt-3 border-t border-surface-700"><p className="text-xs text-surface-500">📱 {a.phone}</p></div>}
            </div>
          ))}
        </div>
      )}

      {showCreate && <ArtistForm title="Yeni Sanatçı Ekle" onClose={() => setShowCreate(false)} onSubmit={handleCreate} />}
      {editing && <ArtistForm title="Sanatçıyı Düzenle" initial={editing} onClose={() => setEditing(null)} onSubmit={handleUpdate} />}
      {deleting && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-800 rounded-xl border border-danger-500/30 w-full max-w-md shadow-2xl animate-scale-in">
            <div className="px-6 py-4 border-b border-surface-700"><h2 className="text-lg font-semibold text-danger-400">⚠️ Sanatçıyı Sil</h2></div>
            <div className="p-6 space-y-4">
              <p className="text-surface-300"><strong>"{deleting.name}"</strong> silinecek.</p>
              {deleting.assigned_characters > 0 && <div className="bg-warning-500/10 border border-warning-500/30 rounded-lg p-3"><p className="text-warning-400 text-sm">⚠️ {deleting.assigned_characters} karakter ataması kaldırılacak.</p></div>}
              <div className="flex justify-end gap-3 pt-2"><button onClick={() => setDeleting(null)} className="btn-secondary">İptal</button><button onClick={handleDelete} className="btn-danger">Sil</button></div>
            </div>
          </div>
        </div>
      )}
      {viewing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-800 rounded-xl border border-surface-700 w-full max-w-lg shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
              <h2 className="text-lg font-semibold text-surface-100">🎙️ {viewing.name}</h2>
              <button onClick={() => setViewing(null)} className="text-surface-500 hover:text-surface-300">✕</button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-surface-500 mb-1">E-posta</p><p className="text-surface-300">{viewing.email || '—'}</p></div>
                <div><p className="text-xs text-surface-500 mb-1">Telefon</p><p className="text-surface-300">{viewing.phone || '—'}</p></div>
              </div>
              {viewing.notes && <div><p className="text-xs text-surface-500 mb-1">Notlar</p><p className="text-surface-300">{viewing.notes}</p></div>}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-700/50 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-surface-200">{viewing.assigned_characters}</p><p className="text-xs text-surface-500">Karakter</p></div>
                <div className="bg-surface-700/50 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-surface-200">{viewing.total_lines}</p><p className="text-xs text-surface-500">Satır</p></div>
                <div className="bg-surface-700/50 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-success-400">{viewing.progress_percent}%</p><p className="text-xs text-surface-500">İlerleme</p></div>
              </div>
              <div>
                <div className="flex justify-between text-sm text-surface-400 mb-2"><span>Kayıt İlerlemesi</span><span>{viewing.recorded_lines} / {viewing.total_lines}</span></div>
                <div className="h-3 bg-surface-700 rounded-full overflow-hidden"><div className="h-full bg-success-500 rounded-full" style={{ width: `${viewing.progress_percent}%` }} /></div>
              </div>
              {viewing.assigned_character_names.length > 0 && (
                <div><p className="text-xs text-surface-500 mb-2">Atanmış Karakterler</p><div className="flex flex-wrap gap-2">{viewing.assigned_character_names.map((n, i) => <span key={i} className="badge bg-surface-700 text-surface-300">🎭 {n}</span>)}</div></div>
              )}
              <div className="flex justify-end pt-2"><button onClick={() => setViewing(null)} className="btn-secondary">Kapat</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ArtistForm({ title, initial, onClose, onSubmit }: {
  title: string; initial?: ArtistItem; onClose: () => void
  onSubmit: (d: { name: string; email: string; phone: string; notes: string }) => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [email, setEmail] = useState(initial?.email || '')
  const [phone, setPhone] = useState(initial?.phone || '')
  const [notes, setNotes] = useState(initial?.notes || '')

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-surface-100">{title}</h2>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-300">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) onSubmit({ name: name.trim(), email, phone, notes }) }} className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-surface-400 mb-1.5">Ad Soyad</label><input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="ör: Ahmet Yılmaz" className="input" autoFocus /></div>
          <div><label className="block text-sm font-medium text-surface-400 mb-1.5">E-posta</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ör: ahmet@email.com" className="input" /></div>
          <div><label className="block text-sm font-medium text-surface-400 mb-1.5">Telefon</label><input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="ör: +90 555 123 4567" className="input" /></div>
          <div><label className="block text-sm font-medium text-surface-400 mb-1.5">Notlar</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ses tonu, aksan..." rows={3} className="input resize-none" /></div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">İptal</button>
            <button type="submit" disabled={!name.trim()} className="btn-primary">{initial ? 'Güncelle' : 'Ekle'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}