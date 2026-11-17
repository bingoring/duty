import postgres from 'postgres'
import { describe, expect, it } from 'vitest'
import { pgOptions } from './client'

// 3-13: Cloud Run은 Cloud SQL에 유닉스 소켓으로 붙는다. postgres.js는 URL의 host 쿼리로는 소켓을 쓰지 않으므로 옵션으로 넘긴다
describe('DB 연결 옵션', () => {
  it('기본은 지금 그대로(소켓 없음, 풀 10)', () => {
    const o = pgOptions({})
    expect(o.host).toBeUndefined()
    expect(o.max).toBe(10)
  })
  it('DB_SOCKET_HOST·DB_POOL_MAX', () => {
    const o = pgOptions({ DB_SOCKET_HOST: '/cloudsql/a:b:c', DB_POOL_MAX: '4' })
    expect(o.host).toBe('/cloudsql/a:b:c')
    expect(o.max).toBe(4)
  })
  it('소켓 경로로 접속한다(연결은 열지 않음)', () => {
    const sql = postgres('postgres://u:p@localhost/duty', pgOptions({ DB_SOCKET_HOST: '/cloudsql/a:b:c' }))
    expect(sql.options.path).toBe('/cloudsql/a:b:c/.s.PGSQL.5432')
  })
})
