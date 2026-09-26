import type { HolidayKind } from '@duty/domain'

// 공공데이터포털 「한국천문연구원_특일 정보」 getRestDeInfo (Build Spec 2-4 R-HOL-API-1·3)
// 인증키는 포털의 Decoding 키를 넣는다(여기서 한 번 인코딩한다).
const ENDPOINT = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo'

export type ApiHoliday = { date: string; name: string; kind: HolidayKind }
export type FetchResult = { ok: true; items: ApiHoliday[] } | { ok: false; message: string }

export function classifyHoliday(name: string): HolidayKind {
  if (/대체/.test(name)) return 'substitute'
  if (/선거/.test(name)) return 'election'
  if (/노동절|근로자/.test(name)) return 'labor_day'
  return 'public'
}

export function restDeUrl(year: number, key: string): string {
  return `${ENDPOINT}?ServiceKey=${encodeURIComponent(key)}&solYear=${year}&numOfRows=100&pageNo=1&_type=json`
}

type RawItem = { dateName?: string; isHoliday?: string; locdate?: number | string }

export async function fetchRestDays(
  year: number,
  key: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<FetchResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000)
  try {
    const res = await (opts.fetchImpl ?? fetch)(restDeUrl(year, key), { signal: controller.signal })
    if (!res.ok) return { ok: false, message: `공공데이터 API 응답 오류(${res.status})` }
    const body = (await res.json()) as {
      response?: {
        header?: { resultCode?: string; resultMsg?: string }
        body?: { items?: { item?: RawItem | RawItem[] } | '' }
      }
    }
    const header = body.response?.header
    if (header?.resultCode !== '00')
      return { ok: false, message: `공공데이터 API 오류: ${header?.resultMsg ?? '알 수 없음'}` }
    const items = body.response?.body?.items
    const raw = items && typeof items === 'object' && items.item ? [items.item].flat() : []
    const seen = new Set<string>()
    const out: ApiHoliday[] = []
    for (const it of raw) {
      if (it.isHoliday !== 'Y' || !it.locdate || !it.dateName) continue
      const d = String(it.locdate)
      const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
      if (seen.has(date)) continue
      seen.add(date)
      out.push({ date, name: it.dateName, kind: classifyHoliday(it.dateName) })
    }
    return { ok: true, items: out }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError')
      return { ok: false, message: '공공데이터 API가 응답하지 않습니다. 잠시 후 다시 시도해 주세요.' }
    return { ok: false, message: '공공데이터 API에 연결하지 못했습니다.' }
  } finally {
    clearTimeout(timer)
  }
}
