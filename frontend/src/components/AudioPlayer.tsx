import { useEffect, useRef, useState } from 'react'
import { str } from '../i18n'

// HTML5 audio with 1h URL re-fetch + retry. Playback URLs expire in 1h (S3_PLAY_EXPIRE_SEC)
// — UI offers silent re-fetch, never caches URL.
export function AudioPlayer({
  fetchUrl,
  onError,
}: {
  fetchUrl: () => Promise<string>
  onError?: (msg: string) => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const load = async () => {
    try {
      setFailed(false)
      const url = await fetchUrl()
      setSrc(url)
    } catch {
      setFailed(true)
      onError?.('تعذّر جلب رابط التشغيل')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Silent re-fetch before expiry (55min).
  useEffect(() => {
    if (!src) return
    const t = window.setTimeout(load, 55 * 60 * 1000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const toggle = async () => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
    } else {
      try {
        await el.play()
      } catch {
        // URL may have expired → silent re-fetch once then play.
        await load()
        try {
          await audioRef.current?.play()
        } catch {
          setFailed(true)
        }
      }
    }
  }

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) return '00:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  if (failed) {
    return (
      <div className="arch card arch-sm p-4 text-center" style={{ borderColor: 'var(--secondary)' }}>
        <p>تعذّر التشغيل</p>
        <button type="button" onClick={load} className="btn-secondary transition-ui mt-2 rounded-lg px-4 py-1.5">
          {str.retryFreshUrl}
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3" dir="rtl">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? str.pause : str.play}
        className="btn-primary transition-ui flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
      >
        {playing ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" />
          </svg>
        )}
      </button>
      <span dir="ltr" className="text-xs tabular-nums">
        {fmt(progress)}
      </span>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={1}
        value={progress}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (audioRef.current) audioRef.current.currentTime = v
          setProgress(v)
        }}
        className="audio-progress w-full"
        aria-label="التقدم"
      />
      <span dir="ltr" className="text-xs tabular-nums">
        {fmt(duration)}
      </span>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
