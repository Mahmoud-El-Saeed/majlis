import { beforeEach, describe, expect, it } from 'vitest'
import {
  PLAYBACK_RATES,
  SKIP_SECONDS,
  clampPosition,
  positionKey,
  readPosition,
  writePosition,
} from '../playback'

describe('playback position storage', () => {
  beforeEach(() => {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  })

  it('keys positions per lesson', () => {
    expect(positionKey('L1')).toBe('mj_pos_L1')
    expect(positionKey('L2')).not.toBe(positionKey('L1'))
    writePosition('L1', 42)
    expect(readPosition('L1')).toBe(42)
    expect(readPosition('L2')).toBeNull()
  })

  it('round-trips fractional seconds', () => {
    writePosition('L1', 8.5)
    expect(readPosition('L1')).toBe(8.5)
  })

  it('ignores invalid stored values', () => {
    try {
      localStorage.setItem(positionKey('L1'), 'soon')
    } catch {
      /* ignore */
    }
    expect(readPosition('L1')).toBeNull()
  })

  it('refuses to store invalid positions', () => {
    writePosition('L1', -5)
    writePosition('L1', Number.NaN)
    expect(readPosition('L1')).toBeNull()
  })
})

describe('clampPosition', () => {
  it('caps at duration', () => {
    expect(clampPosition(600, 300)).toBe(300)
  })
  it('keeps an in-range position', () => {
    expect(clampPosition(42, 300)).toBe(42)
  })
  it('maps negative and NaN to 0', () => {
    expect(clampPosition(-5, 300)).toBe(0)
    expect(clampPosition(Number.NaN, 300)).toBe(0)
  })
  it('passes through while duration is unknown', () => {
    expect(clampPosition(42, 0)).toBe(42)
    expect(clampPosition(42, Number.NaN)).toBe(42)
  })
})

describe('skip step', () => {
  it('is ten seconds', () => {
    expect(SKIP_SECONDS).toBe(10)
  })
})

describe('speed options', () => {
  it('spans at least 0.75×–2× with 1× in the middle', () => {
    expect(PLAYBACK_RATES).toContain(0.75)
    expect(PLAYBACK_RATES).toContain(1)
    expect(PLAYBACK_RATES).toContain(2)
  })
})
