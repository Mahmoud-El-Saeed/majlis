import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { str } from '../i18n'
import {
  PLAYBACK_RATES,
  SKIP_SECONDS,
  clampPosition,
  readPosition,
  writePosition,
} from '../features/media/playback'
import { Star8 } from './Star8'
import { TACTILE_SPRING } from './tactile'

// HTML5 audio with 1h URL re-fetch + retry. Playback URLs expire in 1h (S3_PLAY_EXPIRE_SEC)
// — UI offers silent re-fetch, never caches URL.
//
// Ticket 19 review: the title/pages slots are gone (dead code — Course.tsx
// keeps the lesson title in the page h1 and never passed them). The cassette
// is Side-A-free by user decision; no header block renders at all.
//
// Ticket 24: the last position per lesson is restored on load (clamped to
// duration), persisted on timeupdate/pause/seek and before the silent
// re-fetch, with ±10s skips and 0.75×–2× speed on top of the mj_vol
// persistence and the reduced-motion cassette guard.
export function AudioPlayer({
  lessonId,
  fetchUrl,
  onError,
}: {
  lessonId: string
  fetchUrl: () => Promise<string>
  onError?: (msg: string) => void
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // True once metadata has loaded. Guards the unmount/pagehide persist so a
  // cleanup that runs before any metadata (React StrictMode double-mounts
  // effects in dev) can never overwrite a stored position with 0.
  const loadedRef = useRef(false)
  // Last position the UI observed. The unmount cleanup cannot read the
  // element: React detaches host refs before passive cleanups, so
  // audioRef.current is null there and reading it would persist 0.
  const positionRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [rate, setRate] = useState<number>(1)
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

  useEffect(() => {
    const el = audioRef.current
    if (el) el.playbackRate = rate
  }, [rate, src])

  const persist = useCallback(
    (seconds?: number) => {
      const next = seconds ?? positionRef.current
      positionRef.current = next
      writePosition(lessonId, next)
    },
    [lessonId],
  )

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

  const load = useCallback(async () => {
    try {
      setFailed(false)
      const url = await fetchUrl()
      // New src → duration unknown again: the old duration must not keep
      // skip buttons enabled or clamp against a stale length. The fresh
      // metadata restores the position from storage.
      loadedRef.current = false
      setDuration(0)
      setSrc(url)
    } catch {
      setFailed(true)
      onError?.('تعذّر جلب رابط التشغيل')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  useEffect(() => {
    void load()
  }, [load])

  // Silent re-fetch before expiry (55min). Persist first so swapping the
  // src mid-lesson never jumps back to a stale position.
  useEffect(() => {
    if (!src) return
    const t = window.setTimeout(() => {
      persist()
      void load()
    }, 55 * 60 * 1000)
    return () => window.clearTimeout(t)
  }, [src, load, persist])

  // Keep the last position when leaving the page entirely or navigating
  // in-app. The element is read when it is still attached (pagehide); the
  // position ref is the fallback once React has detached it (unmount).
  useEffect(() => {
    const persistIfLoaded = () => {
      if (!loadedRef.current) return
      const el = audioRef.current
      persist(el?.currentTime)
    }
    window.addEventListener('pagehide', persistIfLoaded)
    return () => {
      persistIfLoaded()
      window.removeEventListener('pagehide', persistIfLoaded)
    }
  }, [persist])

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

  const seekTo = (seconds: number) => {
    const el = audioRef.current
    const target = clampPosition(seconds, duration)
    if (el) el.currentTime = target
    setProgress(target)
    persist(target)
  }

  const skip = (delta: number) => {
    // The element is the source of truth: reading `progress` state here
    // would target a stale position on a rapid second skip.
    const from = audioRef.current?.currentTime ?? progress
    seekTo(clampPosition(from + delta, duration))
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
        <button type="button" onClick={() => void load()} className="btn-secondary transition-ui mt-2 rounded-lg px-4 py-1.5">
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
          onClick={() => void toggle()}
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
          onChange={(e) => seekTo(Number(e.target.value))}
          className="audio-progress w-full"
          aria-label="التقدم"
          aria-valuetext={`${fmt(progress)} من ${fmt(duration)}`}
        />
        <span dir="ltr" className="text-xs tabular-nums">
          {fmt(duration)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => skip(-SKIP_SECONDS)}
          disabled={!duration}
          aria-label={str.skipBack}
          className="transition-ui clickable flex items-center gap-1 rounded-lg border px-3 py-1 text-xs font-bold"
          style={{ borderColor: 'var(--border)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <span dir="ltr">10</span>
        </button>
        <button
          type="button"
          onClick={() => skip(SKIP_SECONDS)}
          disabled={!duration}
          aria-label={str.skipForward}
          className="transition-ui clickable flex items-center gap-1 rounded-lg border px-3 py-1 text-xs font-bold"
          style={{ borderColor: 'var(--border)' }}
        >
          <span dir="ltr">10</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
        </button>
        <label className="flex items-center gap-1 text-xs">
          <span className="muted-t">{str.playbackSpeed}</span>
          <select
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
            aria-label={str.playbackSpeed}
            className="transition-ui clickable rounded-lg border px-2 py-1 text-xs font-bold"
            style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
          >
            {PLAYBACK_RATES.map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>
        <span className="ms-auto flex items-center gap-2">
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
        </span>
      </div>
      {src && (
          <audio
            ref={audioRef}
            src={src}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={(e) => {
              setPlaying(false)
              persist(e.currentTarget.currentTime)
            }}
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime
              setProgress(t)
              persist(t)
            }}
            onLoadedMetadata={(e) => {
              const el = e.currentTarget
              const dur = el.duration
              loadedRef.current = true
              setDuration(dur)
              const restored = clampPosition(readPosition(lessonId) ?? 0, dur)
              el.currentTime = restored
              positionRef.current = restored
              setProgress(restored)
            }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}
