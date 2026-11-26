import {
  characterEndpoints,
  closenessWord,
  relationInDirection,
  RELATION_TYPES,
  VISIBILITY,
} from '../domain.js'
import { esc, field, inp, sel, ta } from './html.js'
import { modal } from './modal.js'
import { toast } from './toast.js'

export function askRelation({ cache, fromId = '', toId = '' } = {}) {
  const people = characterEndpoints(cache)
  if (people.length < 2) {
    toast('Нужны хотя бы два персонажа.', 'error')
    return Promise.resolve(null)
  }
  const options = people.map((person) => [person.id, person.label])
  const from = people.some((person) => person.id === fromId) ? fromId : people[0].id
  const openTargets = (personId) => {
    const taken = new Set((cache.relations || []).filter((rel) => rel.fromId === personId).map((rel) => rel.toId))
    return people.filter((person) => person.id !== personId && !taken.has(person.id))
  }
  const firstTargets = openTargets(from)
  const to = firstTargets.some((person) => person.id === toId) ? toId : (firstTargets[0]?.id || '')
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    modal({
      title: 'Новая связь',
      content: `
        <div class="split">
          ${field('От кого', sel('fromId', from, options))}
          ${field('К кому', sel('toId', to, firstTargets.map((person) => [person.id, person.label])), 'В эту сторону можно сохранить только одну связь.')}
        </div>
        <div class="split">
          ${field('Тип', sel('type', 'trust', RELATION_TYPES))}
          ${field('Своё название', inp('customType', '', { placeholder: 'если тип «Другое»' }))}
        </div>
        <label class="field"><span class="lbl">Близость или враждебность</span>
          <input class="control" type="range" name="closeness" min="-5" max="5" step="1" value="0">
          <span class="hint" data-word>${closenessWord(0)} · 0</span>
        </label>
        ${field('Кто знает', sel('visibility', 'gm', VISIBILITY))}
        ${field('Описание', ta('description', '', 4))}
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-cancel>Отмена</button>
          <button type="button" class="btn" data-submit>Сохранить</button>
        </div>`,
      onMount(wrap, close) {
        const paintTargets = (preferred) => {
          const personId = wrap.querySelector('[name="fromId"]').value
          const available = openTargets(personId)
          const next = available.some((person) => person.id === preferred) ? preferred : (available[0]?.id || '')
          const select = wrap.querySelector('[name="toId"]')
          select.innerHTML = available.map((person) => `<option value="${esc(person.id)}"${person.id === next ? ' selected' : ''}>${esc(person.label)}</option>`).join('')
          select.value = next
        }
        wrap.querySelector('[name="fromId"]').addEventListener('change', () => {
          paintTargets(wrap.querySelector('[name="toId"]').value)
        })
        wrap.querySelector('[name="closeness"]').addEventListener('input', (event) => {
          wrap.querySelector('[data-word]').textContent = `${closenessWord(event.target.value)} · ${event.target.value}`
        })
        wrap.querySelector('[data-cancel]').onclick = () => {
          finish(null)
          close()
        }
        wrap.querySelector('[data-submit]').onclick = () => {
          const draft = {
            fromId: wrap.querySelector('[name="fromId"]').value,
            toId: wrap.querySelector('[name="toId"]').value,
            type: wrap.querySelector('[name="type"]').value,
            customType: wrap.querySelector('[name="customType"]').value,
            closeness: Number(wrap.querySelector('[name="closeness"]').value),
            visibility: wrap.querySelector('[name="visibility"]').value,
            description: wrap.querySelector('[name="description"]').value,
          }
          if (!draft.fromId || !draft.toId || draft.fromId === draft.toId) {
            toast('Выберите двух разных персонажей.', 'error')
            return
          }
          if (relationInDirection(cache.relations, draft.fromId, draft.toId)) {
            toast('В эту сторону связь уже есть.', 'error')
            return
          }
          finish(draft)
          close()
        }
      },
      onClose() {
        finish(null)
      },
    })
  })
}
