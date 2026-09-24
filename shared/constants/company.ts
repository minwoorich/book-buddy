/**
 * 바텍 계열사 사업장 — 지도·장소 검색의 기준점 후보.
 * 좌표는 카카오 로컬 검색 결과(WGS84). 첫 항목(바텍네트웍스 본사)이 기본값이다.
 */
export interface VatechOffice {
  key: string
  name: string
  shortName: string
  address: string
  lat: number
  lng: number
}

export const VATECH_OFFICES: readonly VatechOffice[] = [
  {
    key: 'networks',
    name: '바텍네트웍스 본사',
    shortName: '바텍 본사',
    address: '경기 화성시 동탄구 삼성1로2길 13',
    lat: 37.2209161942749,
    lng: 127.074899581393,
  },
  {
    key: 'msys',
    name: '바텍엠시스',
    shortName: '바텍엠시스',
    address: '경기 수원시 권선구 산업로155번길 38',
    lat: 37.243961964964,
    lng: 126.981380982107,
  },
  {
    key: 'emx',
    name: '바텍이엠엑스',
    shortName: '바텍이엠엑스',
    address: '경기 용인시 처인구 이동읍 남북대로 2544',
    lat: 37.1354730791917,
    lng: 127.212757932712,
  },
] as const

/** 기본 기준점 — 바텍네트웍스 본사(동탄). */
export const VATECH_HQ: VatechOffice = VATECH_OFFICES[0]!

export function findOffice(key: string | undefined): VatechOffice {
  return VATECH_OFFICES.find((o) => o.key === key) ?? VATECH_HQ
}

/**
 * 회사 이름 → 사업장. `users.company`는 계열사 이름(바텍·바텍이우홀딩스·바텍엠시스·레이언스·
 * 바텍네트웍스)이라 사업장 키와 직접 대응하지 않는다. 이름에 단서가 있는 둘만 따로 보고
 * 나머지는 동탄 본사로 본다.
 */
export function officeForCompany(company: string): VatechOffice {
  if (company.includes('엠시스')) return findOffice('msys')
  if (company.includes('이엠엑스')) return findOffice('emx')
  return VATECH_HQ
}

/** 좌표들의 산술 평균 — 참가자 사업장의 "중간 지점". 빈 배열이면 본사. */
export function midpointOf(points: { lat: number; lng: number }[]): { lat: number; lng: number } {
  if (points.length === 0) return { lat: VATECH_HQ.lat, lng: VATECH_HQ.lng }
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length
  return { lat, lng }
}
