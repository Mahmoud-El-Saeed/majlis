import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { str } from '../i18n'
import { Star8 } from './Star8'
import { TACTILE_SPRING } from './tactile'

// HTML5 audio with 1h URL re-fetch + retry. Playback URLs expire in 1h (S3_PLAY_EXPIRE_SEC)
// — UI offers silent re-fetch, never caches URL.
//
// Ticket 19 review: the title/pages slots are gone (dead code — Course.tsx
// keeps the lesson title in the page h1 and never passed them). The cassette
// is Side-A-free by user decision; no header block renders at all.
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
  // Volume persists across lessons (mj_vol); applied to the element below.
  const [volume, setVolume] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('mj_vol')
      if (raw === null) return 1
      const v = Number(raw)
      return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1
    } catch {
      return 1
    }
  })
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = muted ? 0 : volume
    el.muted = muted
  }, [volume, muted, src, playing])

  const changeVolume = (v: number) => {
    const next = Math.min(1, Math.max(0, v))
    setVolume(next)
    if (next > 0) setMuted(false)
    try {
      localStorage.setItem('mj_vol', String(next))
    } catch {
      /* ignore */
    }
  }

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

  const reelClass = `cassette-reel${playing ? ' is-spinning' : ''}`

  return (
    <div className="cassette" dir="rtl" data-playing={playing}>
      <div className="cassette-window" aria-hidden="true">
        <span className={reelClass} data-testid="cassette-reel">
          <Star8 size={26} className="cassette-reel-star" />
        </span>
        <span className={reelClass} data-testid="cassette-reel">
          <Star8 size={26} className="cassette-reel-star" />
        </span>
      </div>
      <div className="flex items-center gap-4">
        <motion.button
          type="button"
          onClick={toggle}
          aria-label={playing ? str.pause : str.play}
          className="cassette-play btn-primary flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
          whileTap={{ scale: 0.9, y: 2 }}
          transition={TACTILE_SPRING}
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
        </motion.button>
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
          aria-valuetext={`${fmt(progress)} من ${fmt(duration)}`}
        />
        <span dir="ltr" className="text-xs tabular-nums">
          {fmt(duration)}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? str.unmute : str.mute}
          aria-pressed={muted}
          className="transition-ui clickable flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
          style={{ borderColor: 'var(--border)' }}
        >
          {muted || volume === 0 ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H2v6h4l5 4z" fill="currentColor" stroke="none" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path d="M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
          className="w-28"
          aria-label={str.volume}
          aria-valuetext={`${Math.round((muted ? 0 : volume) * 100)}٪`}
        />
      </div>
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
