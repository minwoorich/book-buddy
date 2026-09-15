/**
 * 발표자료용 QR 코드 생성기.
 * 기본값은 서비스 커스텀 도메인(https://www.vnlibrary.com).
 *
 * 사용법:
 *   npx tsx scripts/generate-qr.ts                       # 기본 URL
 *   npx tsx scripts/generate-qr.ts https://example.com qr-example
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import QRCode from 'qrcode'

const url = process.argv[2] ?? 'https://www.vnlibrary.com'
const baseName = process.argv[3] ?? 'qr-vnlibrary'
const outDir = resolve(process.cwd(), 'design/presentation')

/** 인쇄·스캔 안정성을 위해 오류정정 레벨 H(30% 복원) + 여백 4모듈. */
const options = { errorCorrectionLevel: 'H', margin: 4 } as const

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true })

  const svgPath = resolve(outDir, `${baseName}.svg`)
  const svg = await QRCode.toString(url, { ...options, type: 'svg' })
  await writeFile(svgPath, svg, 'utf8')

  const pngPath = resolve(outDir, `${baseName}.png`)
  await QRCode.toFile(pngPath, url, { ...options, type: 'png', width: 1024 })

  console.log(`URL   : ${url}`)
  console.log(`SVG   : ${svgPath}`)
  console.log(`PNG   : ${pngPath} (1024px)`)
  console.log(`기준 폴더: ${dirname(svgPath)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
