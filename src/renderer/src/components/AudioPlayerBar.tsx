import { useEffect, useMemo, useRef, useState } from 'react'

export type PlayerSource = {
  url: string
  title: string
  subtitle?: string
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function mediaErrorToText(a: HTMLAudioElement): string {
  const e = a.error
  if (!e) return 'Bilinmeyen hata'
  // https://developer.mozilla.org/en-US/docs/Web/API/MediaError/code
  switch (e.code) {
    case 1: return 'MEDIA_ERR_ABORTED (yükleme iptal edildi)'
    case 2: return 'MEDIA_ERR_NETWORK (ağ/stream hatası)'
    case 3: return 'MEDIA_ERR_DECODE (format çözülemedi)'
    case 4: return 'MEDIA_ERR_SRC_NOT_SUPPORTED (kaynak desteklenmiyor)'
    default: return `MediaError code=${e.code}`
  }
}

export default function AudioPlayerBar({
  source,
  onClose,
}: {
  source: PlayerSource | null
  onClose: () => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.9)
  const [rate, setRate] = useState(1.0)
  const [errorText, setErrorText] = useState<string | null>(null)

  const progressPercent = useMemo(() => {
    if (!duration || duration <= 0) return 0
    return Math.round((current / duration) * 100)
  }, [current, duration])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return

    if (!source) {
      a.pause()
      setIsPlaying(false)
      setCurrent(0)
      setDuration(0)
      setErrorText(null)
      return
    }

    setErrorText(null)

    a.src = source.url
    a.currentTime = 0
    a.volume = volume
    a.playbackRate = rate

    // autoplay dene (bazı sistemlerde çalışır, çalışmazsa sorun değil)
    const playPromise = a.play()
    if (playPromise) {
      playPromise
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    } else {
      setIsPlaying(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.url])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.volume = volume
  }, [volume])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.playbackRate = rate
  }, [rate])

  const togglePlay = async () => {
    const a = audioRef.current
    if (!a) return

    if (isPlaying) {
      a.pause()
      setIsPlaying(false)
      return
    }

    try {
      setErrorText(null)
      await a.play()
      setIsPlaying(true)
    } catch {
      setIsPlaying(false)
      setErrorText('Play başlatılamadı (kaynak okunamadı).')
    }
  }

  const seekToPercent = (p: number) => {
    const a = audioRef.current
    if (!a || !duration) return
    const t = (p / 100) * duration
    a.currentTime = t
    setCurrent(t)
  }

  const onLoadedMetadata = () => {
    const a = audioRef.current
    if (!a) return
    const d = Number.isFinite(a.duration) ? a.duration : 0
    setDuration(d)
  }

  const onTimeUpdate = () => {
    const a = audioRef.current
    if (!a) return
    setCurrent(a.currentTime || 0)
  }

  const onEnded = () => {
    setIsPlaying(false)
  }

  const onError = () => {
    const a = audioRef.current
    if (!a) return
    setIsPlaying(false)
    setErrorText(mediaErrorToText(a))
  }

  if (!source) return null

  return (
    <div className="sticky bottom-0 z-40">
      <div className="bg-surface-850/95 backdrop-blur border border-surface-700 rounded-xl p-4 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-surface-200 truncate">{source.title}</div>
            {source.subtitle && <div className="text-xs text-surface-500 truncate mt-0.5">{source.subtitle}</div>}
            {errorText && <div className="text-xs text-danger-400 mt-2">{errorText}</div>}
            {!errorText && <div className="text-2xs text-surface-600 mt-2 truncate">{source.url}</div>}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={togglePlay} className="btn-primary px-3 py-2">
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button onClick={() => { audioRef.current?.pause(); onClose() }} className="btn-secondary px-3 py-2">
              ✕
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-surface-500 mb-2">
            <span>{formatTime(current)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <input
            type="range"
            min={0}
            max={100}
            value={progressPercent}
            onChange={(e) => seekToPercent(Number(e.target.value))}
            className="w-full"
          />

          <div className="mt-3 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-500 w-10">Ses</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
              />
              <span className="text-xs text-surface-500 w-10 text-right">{Math.round(volume * 100)}%</span>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <span className="text-xs text-surface-500">Hız</span>
              <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="input w-auto py-1">
                <option value={0.75}>0.75x</option>
                <option value={1}>1.0x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
              </select>
            </div>
          </div>
        </div>

        <audio
          ref={audioRef}
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={onTimeUpdate}
          onEnded={onEnded}
          onError={onError}
        />
      </div>
    </div>
  )
}