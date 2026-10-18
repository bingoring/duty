import { eq } from 'drizzle-orm'
import { users } from './db/schema'

// 3-7a: 간호사 화면·생성·정산은 간호사 직군만 본다(의사는 doctor_* 테이블과 의사 화면이 따로)
export const NURSES = eq(users.roleGroup, 'nurse')
export const DOCTORS = eq(users.roleGroup, 'doctor')
