import { writeFileSync } from 'node:fs'
import { serializeSchema } from './schema'

writeFileSync(new URL('../solver.schema.json', import.meta.url), serializeSchema())
console.log('solver.schema.json 생성')
