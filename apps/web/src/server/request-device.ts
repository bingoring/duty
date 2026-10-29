import 'server-only'
import { headers } from 'next/headers'
import { DEVICE_HEADER, type Device } from './device'

// 요청 경로(레이아웃·페이지)의 기기. proxy.ts가 넣은 헤더만 믿고, 없으면 데스크톱
export async function requestDevice(): Promise<Device> {
  return (await headers()).get(DEVICE_HEADER) === 'mobile' ? 'mobile' : 'desktop'
}
