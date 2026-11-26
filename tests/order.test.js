import assert from 'node:assert/strict'
import test from 'node:test'
import { appendOrder, byOrder } from '../js/domain.js'

test('без своего порядка список идёт по имени', () => {
  const list = byOrder([{ name: 'Ян' }, { name: 'Ада' }, { name: 'Борис' }])
  assert.deepEqual(list.map((item) => item.name), ['Ада', 'Борис', 'Ян'])
})

test('сохранённый порядок важнее имени', () => {
  const list = byOrder([
    { name: 'Ада', order: 2 },
    { name: 'Ян', order: 0 },
    { name: 'Борис', order: 1 },
  ])
  assert.deepEqual(list.map((item) => item.name), ['Ян', 'Борис', 'Ада'])
})

test('новая карточка встаёт в конец уже расставленного списка', () => {
  assert.deepEqual(appendOrder([{ order: 0 }, { order: 4 }]), { order: 5 })
  assert.deepEqual(appendOrder([{ name: 'Ада' }]), {})
})
