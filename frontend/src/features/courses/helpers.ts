import { api } from '../../api/http'
import type { FileOut } from '../../api/types'

// Ticket 16: kind is derived from the stored book name — the single spelling
// of the check, so components cannot drift (mirrors is_book_based backend,
// including the whitespace normalization).
export function courseHasBook(course: { book_title?: string | null }): boolean {
  return (course.book_title ?? '').trim() !== ''
}

// Shared direct-to-storage PUT: one spelling of the upload-url → browser
// PUT step used by course + lesson attachment uploads.
export async function putFileToUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`PUT ${xhr.status}`))
    xhr.onerror = () => reject(new Error('upload failed'))
    xhr.send(file)
  })
}

// Client-side Arabic search: case-insensitive, strips Arabic diacritics
// (U+064B–U+0652) and tatweel (U+0640) so «مُقَدِّمَة» matches «مقدمة».
// Callers join the visible fields (title + description/phone/email) into one
// haystack; an empty needle matches everything (unfiltered list).
const AR_STRIP = /[\u064B-\u0652\u0640]/g

export function normalizeArabic(s: string): string {
  return s.replace(AR_STRIP, '').toLowerCase()
}

export function matchesArabic(haystack: string | null | undefined, needle: string): boolean {
  const n = normalizeArabic(needle.trim())
  if (!n) return true
  return normalizeArabic(haystack ?? '').includes(n)
}

export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024

// Shared signed-file opener (ticket 16 review): one place for the
// GET /file → window.open pattern used by course/lesson attachments.
export async function openAttachmentFile(
  scope: 'course' | 'lesson',
  attachmentId: string,
): Promise<void> {
  const prefix = scope === 'course' ? 'course-attachments' : 'lesson-attachments'
  const f = await api.get<FileOut>(`/${prefix}/${attachmentId}/file`)
  window.open(f.file_url, '_blank', 'noopener')
}
