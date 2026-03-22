import { useState, useEffect, useCallback } from 'react'
import { useApp } from '../App'

interface CharacterItem {
  id: string
  name: string
  description: string
  priority: string
  image_path: string | null
  assigned_artist_id: string | null
  artist_name: string | null
  total_files: number
  translated_count: number
  recorded_count: number
  mixed_count: number
  created_at: string
}

interface ArtistOption {
  id: string
  name: string
}

function getPriorityLabel(p: string): string {
  return { main: 'Ana Karakter', supporting: 'Yan Karakter', npc: 'NPC', extra: 'Ekstra' }[p] || p
}

function getPriorityBadge(p: string): string {
  return {
    main: 'badge-primary',
    supporting: 'badge-success',
    npc: 'badge-warning',
    extra: 'badge bg-surface-600/30 text-surface-400',
  }[p] || 'badge-warning'
}

function pct(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

export default function CharactersPage() {
  const { project, showToast, refreshProgress } = useApp()
  const [characters, setCharacters] = useState<CharacterItem[]>([])
  const [artists, setArtists] = useState<ArtistOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [prioFilter, setPrioFilter] = useState('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<CharacterItem | null>(null)
  const [deleting, setDeleting] = useState<CharacterItem | null>(null)
  const [assigning, setAssigning] = useState<CharacterItem | null>(null)

  const load = useCallback(async () => {
    if (!project) return
    setIsLoading(true)
    try {
      const r = await window.api.invoke('character:list', project.id) as any
      if (r.success) setCharacters(r.characters)
      else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
    finally { setIsLoading(false) }
  }, [project])

  const loadArtists = useCallback(async () => {
    if (!project) return
    try {
      const r = await window.api.invoke('artist:list', project.id) as any
      if (r.success) setArtists(r.artists.map((a: any) => ({ id: a.id, name: a.name })))
    } catch {}
  }, [project])

  useEffect(() => { load(); loadArtists() }, [load, loadArtists])

  const handleCreate = async (d: { name: string; description: string; priority: string }) => {
    if (!project) return
    try {
      const r = await window.api.invoke('character:create', {
        project_id: project.id, project_path: project.project_path,
        name: d.name, description: d.description, priority: d.priority,
      }) as any
      if (r.success) {
        showToast('success', 'Karakter oluşturuldu', `"${d.name}" ve klasörleri oluşturuldu.`)
        setShowCreate(false); await load(); await refreshProgress()
      } else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
  }

  const handleUpdate = async (d: { name: string; description: string; priority: string }) => {
    if (!project || !editing) return
    try {
      const r = await window.api.invoke('character:update', {
        id: editing.id, project_id: project.id, project_path: project.project_path, updates: d,
      }) as any
      if (r.success) {
        showToast('success', 'Güncellendi', `"${d.name}" güncellendi.`)
        setEditing(null); await load()
      } else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
  }

  const handleDelete = async () => {
    if (!project || !deleting) return
    try {
      const r = await window.api.invoke('character:delete', {
        id: deleting.id, project_id: project.id,
        project_path: project.project_path, delete_files: true,
      }) as any
      if (r.success) {
        showToast('success', 'Silindi', `"${deleting.name}" silindi.`)
        setDeleting(null); await load(); await refreshProgress()
      } else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
  }

  const handleAssign = async (artistId: string | null) => {
    if (!project || !assigning) return
    try {
      const r = await window.api.invoke('character:assign-artist', {
        character_id: assigning.id, project_id: project.id, artist_id: artistId,
      }) as any
      if (r.success) {
        showToast('success', 'Atama güncellendi')
        setAssigning(null); await load()
      } else showToast('error', 'Hata', r.error)
    } catch (e: any) { showToast('error', 'Hata', e.message) }
  }

  const filtered = characters.filter(c => {
    if (search) {
      const q = search.toLowerCase()
      if (!c.name.toLowerCase().includes(q) && !c.artist_name?.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q)) return false
    }
    if (prioFilter !== 'all' && c.priority !== prioFilter) return false
    return true
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500">🔍</span>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Karakter veya sanatçı ara..." className="input pl-10" />
          </div>
          <select value={prioFilter} onChange={e => setPrioFilter(e.target.value)} className="input w-auto">
            <option value="all">Tüm Öncelikler</option>
            <option value="main">Ana Karakter</option>
            <option value="supporting">Yan Karakter</option>
            <option value="npc">NPC</option>
            <option value="extra">Ekstra</option>
          </select>
          <div className="flex items-center bg-surface-800 rounded-lg border border-surface-700">
            <button onClick={() => setView('grid')}
              className={`px-3 py-2 rounded-l-lg transition-colors ${view === 'grid' ? 'bg-primary-600 text-white' : 'text-surface-400 hover:text-surface-200'}`}>▦</button>
            <button onClick={() => setView('list')}
              className={`px-3 py-2 rounded-r-lg transition-colors ${view === 'list' ? 'bg-primary-600 text-white' : 'text-surface-400 hover:text-surface-200'}`}>☰</button>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">➕ Yeni Karakter</button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="card flex items-center gap-3">
          <span className="text-2xl">🎭</span>
          <div><p className="text-2xl font-bold text-surface-200">{characters.length}</p><p className="text-xs text-surface-500">Toplam</p></div>
        </div>
        <div className="card flex items-center gap-3">
          <span className="text-2xl">👤</span>
          <div><p className="text-2xl font-bold text-surface-200">{characters.filter(c => c.priority === 'main').length}</p><p className="text-xs text-surface-500">Ana Karakter</p></div>
        </div>
        <div className="card flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div><p className="text-2xl font-bold text-warning-400">{characters.filter(c => !c.assigned_artist_id).length}</p><p className="text-xs text-surface-500">Atanmamış</p></div>
        </div>
        <div className="card flex items-center gap-3">
          <span className="text-2xl">🔊</span>
          <div><p className="text-2xl font-bold text-surface-200">{characters.reduce((s, c) => s + c.total_files, 0)}</p><p className="text-xs text-surface-500">Toplam Ses</p></div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <span className="text-6xl mb-4 block">🎭</span>
          <h3 className="text-xl font-semibold text-surface-300 mb-2">{characters.length > 0 ? 'Sonuç bulunamadı' : 'Henüz karakter yok'}</h3>
          <p className="text-surface-500 mb-6">{characters.length > 0 ? 'Filtre kriterlerini değiştirin.' : 'İlk karakteri oluşturarak başlayın.'}</p>
          {characters.length === 0 && <button onClick={() => setShowCreate(true)} className="btn-primary">➕ İlk Karakteri Oluştur</button>}
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="card-hover group">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-surface-700 flex items-center justify-center text-xl flex-shrink-0">🎭</div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-surface-200 truncate">{c.name}</h3>
                    <span className={getPriorityBadge(c.priority)}>{getPriorityLabel(c.priority)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setAssigning(c)} className="btn-ghost p-1.5 text-sm" title="Sanatçı Ata">🎙️</button>
                  <button onClick={() => setEditing(c)} className="btn-ghost p-1.5 text-sm" title="Düzenle">✏️</button>
                  <button onClick={() => setDeleting(c)} className="btn-ghost p-1.5 text-sm text-danger-400" title="Sil">🗑️</button>
                </div>
              </div>
              {c.description && <p className="text-sm text-surface-500 mb-3 line-clamp-2">{c.description}</p>}
              <div className="flex items-center gap-2 mb-4">
                {c.artist_name ? <span className="badge-success">🎙️ {c.artist_name}</span> : <span className="badge-warning">⚠️ Atanmamış</span>}
              </div>
              <div className="text-sm text-surface-500 mb-3">{c.total_files} ses dosyası</div>
              <div className="space-y-2">
                <MiniBar label="Çeviri" value={pct(c.translated_count, c.total_files)} color="bg-translation" />
                <MiniBar label="Kayıt" value={pct(c.recorded_count, c.total_files)} color="bg-recording" />
                <MiniBar label="Mix" value={pct(c.mixed_count, c.total_files)} color="bg-mixing" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead><tr className="border-b border-surface-700">
              <th className="text-left px-4 py-3 text-sm font-medium text-surface-400">Karakter</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-surface-400">Öncelik</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-surface-400">Sanatçı</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-surface-400">Dosya</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-surface-400">Çeviri</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-surface-400">Kayıt</th>
              <th className="text-center px-4 py-3 text-sm font-medium text-surface-400">Mix</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-surface-400">İşlem</th>
            </tr></thead>
            <tbody>{filtered.map(c => (
              <tr key={c.id} className="border-b border-surface-700/50 hover:bg-surface-800/50 transition-colors">
                <td className="px-4 py-3"><div className="flex items-center gap-3"><span className="text-xl">🎭</span><div><p className="font-medium text-surface-200">{c.name}</p></div></div></td>
                <td className="px-4 py-3"><span className={getPriorityBadge(c.priority)}>{getPriorityLabel(c.priority)}</span></td>
                <td className="px-4 py-3">{c.artist_name ? <span className="text-surface-300">{c.artist_name}</span> : <span className="text-warning-400 text-sm">Atanmamış</span>}</td>
                <td className="px-4 py-3 text-center text-surface-300">{c.total_files}</td>
                <td className="px-4 py-3 text-center text-surface-300">{pct(c.translated_count, c.total_files)}%</td>
                <td className="px-4 py-3 text-center text-surface-300">{pct(c.recorded_count, c.total_files)}%</td>
                <td className="px-4 py-3 text-center text-surface-300">{pct(c.mixed_count, c.total_files)}%</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setAssigning(c)} className="btn-ghost p-1.5 text-sm">🎙️</button>
                    <button onClick={() => setEditing(c)} className="btn-ghost p-1.5 text-sm">✏️</button>
                    <button onClick={() => setDeleting(c)} className="btn-ghost p-1.5 text-sm text-danger-400">🗑️</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {showCreate && <CharForm title="Yeni Karakter Oluştur" onClose={() => setShowCreate(false)} onSubmit={handleCreate} />}
      {editing && <CharForm title="Karakteri Düzenle" initial={editing} onClose={() => setEditing(null)} onSubmit={handleUpdate} />}
      {deleting && <DelModal name={deleting.name} files={deleting.total_files} onClose={() => setDeleting(null)} onConfirm={handleDelete} />}
      {assigning && <AssignModal character={assigning} artists={artists} onClose={() => setAssigning(null)} onAssign={handleAssign} />}
    </div>
  )
}

function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs text-surface-500 w-10">{label}</span>
      <div className="flex-1 h-1.5 bg-surface-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-300`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-2xs text-surface-500 w-8 text-right">{value}%</span>
    </div>
  )
}

function CharForm({ title, initial, onClose, onSubmit }: {
  title: string; initial?: CharacterItem; onClose: () => void
  onSubmit: (d: { name: string; description: string; priority: string }) => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [desc, setDesc] = useState(initial?.description || '')
  const [prio, setPrio] = useState(initial?.priority || 'npc')

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-surface-100">{title}</h2>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-300">✕</button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (name.trim()) onSubmit({ name: name.trim(), description: desc, priority: prio }) }} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-400 mb-1.5">Karakter Adı</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="ör: Main Hero" className="input" autoFocus />
            {initial && name !== initial.name && <p className="text-xs text-warning-400 mt-1.5">⚠️ İsim değiştiğinde 3 klasör de yeniden adlandırılacak.</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-400 mb-1.5">Açıklama</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Karakter hakkında..." rows={3} className="input resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-400 mb-1.5">Öncelik</label>
            <select value={prio} onChange={e => setPrio(e.target.value)} className="input">
              <option value="main">Ana Karakter</option><option value="supporting">Yan Karakter</option>
              <option value="npc">NPC</option><option value="extra">Ekstra</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">İptal</button>
            <button type="submit" disabled={!name.trim()} className="btn-primary">{initial ? 'Güncelle' : 'Oluştur'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DelModal({ name, files, onClose, onConfirm }: { name: string; files: number; onClose: () => void; onConfirm: () => void }) {
  const [txt, setTxt] = useState('')
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-xl border border-danger-500/30 w-full max-w-md shadow-2xl animate-scale-in">
        <div className="px-6 py-4 border-b border-surface-700"><h2 className="text-lg font-semibold text-danger-400">⚠️ Karakteri Sil</h2></div>
        <div className="p-6 space-y-4">
          <p className="text-surface-300"><strong>"{name}"</strong> ve tüm verileri silinecek:</p>
          <ul className="text-sm text-surface-400 space-y-1 pl-4">
            <li>• {files} ses dosyası</li><li>• Tüm çeviri verileri</li><li>• 3 karakter klasörü</li>
          </ul>
          <div>
            <label className="block text-sm font-medium text-surface-400 mb-1.5">Onay için karakter adını yazın: <strong>{name}</strong></label>
            <input type="text" value={txt} onChange={e => setTxt(e.target.value)} placeholder={name} className="input" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary">İptal</button>
            <button onClick={onConfirm} disabled={txt !== name} className="btn-danger">Kalıcı Olarak Sil</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AssignModal({ character, artists, onClose, onAssign }: {
  character: CharacterItem; artists: ArtistOption[]; onClose: () => void; onAssign: (id: string | null) => void
}) {
  const [sel, setSel] = useState(character.assigned_artist_id || '')
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-800 rounded-xl border border-surface-700 w-full max-w-md shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-surface-100">Sanatçı Ata</h2>
          <button onClick={onClose} className="text-surface-500 hover:text-surface-300">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-surface-400"><strong className="text-surface-200">"{character.name}"</strong> karakterine sanatçı atayın:</p>
          {artists.length === 0 ? (
            <p className="text-center text-surface-500 py-6">Henüz sanatçı eklenmemiş.</p>
          ) : (
            <div className="space-y-2">
              <button onClick={() => setSel('')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left ${sel === '' ? 'border-primary-500 bg-primary-500/10' : 'border-surface-700 hover:border-surface-600'}`}>
                <span className="text-xl">🚫</span><span className="text-surface-300">Atama Kaldır</span>
              </button>
              {artists.map(a => (
                <button key={a.id} onClick={() => setSel(a.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors text-left ${sel === a.id ? 'border-primary-500 bg-primary-500/10' : 'border-surface-700 hover:border-surface-600'}`}>
                  <span className="text-xl">🎙️</span><span className="text-surface-200">{a.name}</span>
                  {character.assigned_artist_id === a.id && <span className="badge-primary ml-auto">Mevcut</span>}
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <button onClick={onClose} className="btn-secondary">İptal</button>
            <button onClick={() => onAssign(sel || null)} disabled={artists.length === 0} className="btn-primary">Kaydet</button>
          </div>
        </div>
      </div>
    </div>
  )
}