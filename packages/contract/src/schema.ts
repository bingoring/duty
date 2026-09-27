import { z } from 'zod'
import { SolverRequest, SolverResponse } from './solver'

// JSON Schema 생성물 (Python pydantic 모델의 입력)
const def = (schema: Record<string, unknown>) => {
  const { $schema: _drop, ...rest } = schema
  return (void _drop, rest)
}

export function solverJsonSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'DutySolverContract',
    $defs: {
      SolverRequest: def(z.toJSONSchema(SolverRequest, { target: 'draft-2020-12', io: 'input' })),
      SolverResponse: def(z.toJSONSchema(SolverResponse, { target: 'draft-2020-12', io: 'output' })),
    },
  }
}

export const serializeSchema = () => `${JSON.stringify(solverJsonSchema(), null, 2)}\n`
