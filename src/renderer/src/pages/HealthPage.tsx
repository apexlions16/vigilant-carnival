import { useEffect, useState } from 'react'
import { useApp } from '../App'

interface HealthIssue {
  id: string
  severity: 'error' | 'warning' | 'info'
  category: string
  message: string
  details: string
  auto_fixable: boolean
  entity_id?: string
  entity_type?: string
  fix_action?: string
}

interface HealthReport {
  checked_at: string
  overall_status: 'healthy' | 'warning' | 'critical'
  issues: HealthIssue[]
  summary: {
    total_checks: number
    errors: number
    warnings: number
    info: number
    passed: number
  }
}

function statusUi(status: HealthReport['overall_status']) {
  if (status === 'healthy') return { label: 'Sağlam', badge: 'badge-success', icon: '✅' }
  if (status === 'warning') return { label: 'Uyarı', badge: 'badge-warning', icon: '⚠️' }
  return { label: 'Kritik', badge: 'badge-danger', icon: '❌' }
}

function sevUi(sev: HealthIssue['severity']) {
  if (sev === 'error') return { badge: 'badge-danger', box: 'border-danger-500/30 bg-danger-500/10', icon: '❌', label: 'Kritik' }
  if (sev === 'warning') return { badge: 'badge-warning', box: 'border-warning-500/30 bg-warning-500/10', icon: '⚠️', label: 'Uyarı' }
  return { badge: 'badge bg-info-500/20 text-info-400', box: 'border-info-500/30 bg-info-500/10', icon: 'ℹ️', label: 'Bilgi' }
}

function entityLabel(type?: string) {
  if (!type) return ''
  const map: Record<string, string> = {
    project: 'Proje',
    character: 'Karakter',
    voice_artist: 'Sanatçı',
    audio_file: 'Ses Dosyası',
    translation: 'Çeviri',
  }
  return map[type] || type
}

export default function HealthPage() {
  const { project, showToast } = useApp()
  const [report, setReport] = useState<HealthReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [fixingAll, setFixingAll] = useState(false)

  const load = async () => {
    if (!project) return
    setLoading(true)
    try {
      const r = (await window.api.invoke('health:check', {
        project_id: project.id,
        project_path: project.project_path,
      })) as any
      if (r.success) setReport(r.report)
      else showToast('error', 'Health hatası', r.error)
    } catch (e: any) {
      showToast('error', 'Health hatası', e.message)
    } finally {
      setLoading(false)
    }
  }

  const fixOne = async (issue: HealthIssue) => {
    if (!project) return
    try {
      const r = (await window.api.invoke('health:fix', {
        project_id: project.id,
        project_path: project.project_path,
        issue,
      })) as any

      if (r.success) {
        showToast('success', 'Düzeltildi', r.message)
        await load()
      } else {
        showToast('error', 'Düzeltme başarısız', r.message || r.error)
      }
    } catch (e: any) {
      showToast('error', 'Düzeltme hatası', e.message)
    }
  }

  const fixAll = async () => {
    if (!project) return
    setFixingAll(true)
    try {
      const r = (await window.api.invoke('health:fix-all', {
        project_id: project.id,
        project_path: project.project_path,
      })) as any

      if (r.success) {
        showToast('success', 'Toplu düzeltme', `${r.fixed_count} düzeltildi, ${r.failed_count} başarısız.`)
        await load()
      } else {
        showToast('error', 'Toplu düzeltme hatası', r.error)
      }
    } catch (e: any) {
      showToast('error', 'Toplu düzeltme hatası', e.message)
    } finally {
      setFixingAll(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id])

  const fixableCount = report ? report.issues.filter(i => i.auto_fixable).length : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-surface-200">🏥 Sağlık Kontrolü</h2>
          <p className="text-sm text-surface-500">Dosya sistemi ↔ veritabanı tutarlılığı</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary" disabled={loading}>
            Yenile
          </button>
          <button onClick={fixAll} className="btn-primary" disabled={fixingAll || fixableCount === 0}>
            {fixingAll ? 'Düzeltiliyor...' : `Toplu Düzelt (${fixableCount})`}
          </button>
        </div>
      </div>

      {!report && loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {report && (
        <>
          <div className="card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{statusUi(report.overall_status).icon}</div>
                <div>
                  <div className={`inline-flex ${statusUi(report.overall_status).badge}`}>
                    {statusUi(report.overall_status).label}
                  </div>
                  <div className="text-xs text-surface-500 mt-1">
                    Son kontrol: {new Date(report.checked_at).toLocaleString('tr-TR')}
                  </div>
                </div>
              </div>

              <div className="text-sm text-surface-400">
                <div>Hata: <span className="text-danger-400 font-medium">{report.summary.errors}</span></div>
                <div>Uyarı: <span className="text-warning-400 font-medium">{report.summary.warnings}</span></div>
              </div>
            </div>
          </div>

          {report.issues.length === 0 ? (
            <div className="card text-center py-14">
              <div className="text-5xl mb-3">✅</div>
              <div className="text-surface-200 font-semibold">Sorun bulunamadı</div>
              <div className="text-surface-500 text-sm mt-1">Her şey tutarlı görünüyor.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {report.issues.map((issue) => {
                const ui = sevUi(issue.severity)
                return (
                  <div key={issue.id} className={`card border ${ui.box}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{ui.icon}</span>
                          <span className={`inline-flex ${ui.badge}`}>{ui.label}</span>
                          <span className="text-surface-200 font-medium truncate">{issue.message}</span>
                        </div>
                        <div className="text-xs text-surface-500 mt-1">{issue.details}</div>

                        {issue.entity_type && issue.entity_id && (
                          <div className="text-xs text-surface-500 mt-2">
                            {entityLabel(issue.entity_type)} ID:{' '}
                            <span className="font-mono text-surface-300">{issue.entity_id}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex-shrink-0">
                        {issue.auto_fixable ? (
                          <button className="btn-secondary" onClick={() => fixOne(issue)}>
                            Otomatik Düzelt
                          </button>
                        ) : (
                          <span className="text-xs text-surface-500">Manuel</span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}