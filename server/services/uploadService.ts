import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ApiError } from '../utils/errors'

const UPLOAD_DIR = '.data/uploads'

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

const ALLOWED_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp'])

/** `/^[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i`만 허용 — 경로 탈출(`../`) 방지 겸 저장 파일명 검증. */
const NAME_RE = /^[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i

function extFromFilename(filename?: string): string | undefined {
  const match = filename?.match(/\.([a-zA-Z0-9]+)$/)
  return match?.[1]?.toLowerCase()
}

export const uploadService = {
  /** 이미지를 `.data/uploads/<uuid>.<ext>`에 저장하고 `/api/uploads/<name>` 경로를 돌려준다. */
  save(file: { data: Buffer; filename?: string; type?: string }): string {
    const ext = (file.type ? EXT_BY_MIME[file.type] : undefined) ?? extFromFilename(file.filename)
    if (!ext || !ALLOWED_EXTS.has(ext)) {
      throw new ApiError(400, '지원하지 않는 이미지 형식이에요')
    }
    mkdirSync(UPLOAD_DIR, { recursive: true })
    const name = `${randomUUID()}.${ext}`
    writeFileSync(join(UPLOAD_DIR, name), file.data)
    return `/api/uploads/${name}`
  },

  /**
   * 저장된 이미지를 삭제한다. `/api/uploads/<name>` 형태의 공개 경로와 파일명 둘 다 받는다.
   * 검증에 실패하거나 파일이 이미 없으면 조용히 무시한다(정리 용도 — 실패가 흐름을 막으면 안 된다).
   */
  remove(pathOrName: string): void {
    const name = pathOrName.split('/').pop() ?? ''
    if (!NAME_RE.test(name)) return
    const path = join(UPLOAD_DIR, name)
    if (existsSync(path)) unlinkSync(path)
  },

  /** 파일명을 검증해 경로 탈출을 막고 파일을 읽어 돌려준다. 없으면 404. */
  serve(name: string): { data: Buffer; type: string } {
    if (!NAME_RE.test(name)) throw new ApiError(400, '잘못된 파일 이름이에요')
    const path = join(UPLOAD_DIR, name)
    if (!existsSync(path)) throw new ApiError(404, '없는 파일이에요')
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    return { data: readFileSync(path), type: CONTENT_TYPE_BY_EXT[ext] ?? 'application/octet-stream' }
  },
}
