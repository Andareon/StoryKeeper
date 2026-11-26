import { characterEndpoints, closenessWord, personName, RELATION_TYPES, VISIBILITY } from '../domain.js'
import { campaignHash } from '../router.js'
import { createSaver } from '../services/autosave.js'
import { esc, icon, mountIcons } from './html.js'
import { confirmDialog } from './modal.js'
import { askRelation } from './relation-form.js'

export function mountRelationList(container, ctx, ownerId) {
  const saver = createSaver({
    async save(rows) {
      const stored = rows.filter((row) => row?.id)
      for (const row of stored) await ctx.db.put('relations', row, { touch: false })
      if (stored.length) await ctx.db.touch()
    },
    onStatus: ctx.setStatus,
  })
  let busy = false

  function snapshot() {
    const rows = []
    for (const row of container.querySelectorAll('[data-rel]')) {
      const current = ctx.db.cache.relations.find((item) => item.id === row.dataset.rel)
      const type = row.querySelector('[data-key="type"]')
      if (!current?.id || !type) continue
      rows.push({
        ...current,
        type: type.value,
        customType: row.querySelector('[data-key="customType"]').value,
        description: row.querySelector('[data-key="description"]').value,
        closeness: Number(row.querySelector('[data-key="closeness"]').value),
        visibility: row.querySelector('[data-key="visibility"]').value,
      })
    }
    return rows
  }

  function paint() {
    const relations = ctx.db.cache.relations.filter((item) => item.fromId === ownerId || item.toId === ownerId)
    const options = characterEndpoints(ctx.db.cache).filter((person) => person.id !== ownerId)
    container.innerHTML = `
      ${relations.map((rel) => {
        const otherId = rel.fromId === ownerId ? rel.toId : rel.fromId
        return `<article class="row-card" data-rel="${esc(rel.id)}">
          <div class="row-between">
            <strong>${esc(personName(ctx.db.cache, otherId))}</strong>
            <button type="button" class="text-btn" data-open="${esc(rel.id)}">На схеме</button>
          </div>
          <label class="field"><span class="lbl">Тип</span>
            <select class="control" data-key="type" data-save="now">${RELATION_TYPES.map(([value, label]) => `<option value="${esc(value)}"${value === rel.type ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>
          </label>
          <label class="field"><span class="lbl">Своё название</span><input class="control" data-key="customType" data-save="text" value="${esc(rel.customType || '')}" autocomplete="off"></label>
          <label class="field"><span class="lbl">Близость ${esc(closenessWord(rel.closeness))}</span>
            <input type="range" min="-5" max="5" step="1" data-key="closeness" data-save="now" value="${Number(rel.closeness) || 0}">
            <span class="hint" data-word>${esc(closenessWord(rel.closeness))} · ${Number(rel.closeness) || 0}</span>
          </label>
          <label class="field"><span class="lbl">Кто знает</span>
            <select class="control" data-key="visibility" data-save="now">${VISIBILITY.map(([value, label]) => `<option value="${esc(value)}"${value === rel.visibility ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select>
          </label>
          <label class="field"><span class="lbl">Описание</span><textarea class="control" data-key="description" data-save="text" rows="3" spellcheck="true">${esc(rel.description || '')}</textarea></label>
          <button type="button" class="text-btn danger" data-remove="${esc(rel.id)}">Удалить связь</button>
        </article>`
      }).join('') || '<p class="hint">Связей пока нет.</p>'}
      <button type="button" class="btn btn-small" data-add ${options.length ? '' : 'disabled'}>${icon('plus')}Создать связь</button>`
    mountIcons(container)
    container.querySelectorAll('[data-open]').forEach((button) => {
      button.onclick = () => ctx.go(campaignHash(ctx.id, 'relations', button.dataset.open))
    })
    container.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = async () => {
        const ok = await confirmDialog({
          title: 'Удалить связь',
          text: 'Связь исчезнет и со схемы отношений.',
        })
        if (!ok) return
        await saver.flush()
        await ctx.db.remove('relations', button.dataset.remove)
        paint()
      }
    })
    const add = container.querySelector('[data-add]')
    if (add) {
      add.onclick = async () => {
        if (busy) return
        const draft = await askRelation({ cache: ctx.db.cache, fromId: ownerId })
        if (!draft || busy) return
        busy = true
        ctx.setStatus('saving')
        try {
          await saver.flush()
          await ctx.db.put('relations', draft)
          ctx.setStatus('saved')
          paint()
        } catch (error) {
          ctx.setStatus('error', error)
        } finally {
          busy = false
        }
      }
    }
  }

  container.addEventListener('input', (event) => {
    const key = event.target?.dataset?.key
    if (!key) return
    if (key === 'closeness') {
      const card = event.target.closest('[data-rel]')
      const word = card?.querySelector('[data-word]')
      if (word) word.textContent = `${closenessWord(event.target.value)} · ${event.target.value}`
      return
    }
    if (event.target.dataset.save === 'text') {
      event.stopPropagation()
      saver.schedule(snapshot())
    }
  })
  container.addEventListener('change', (event) => {
    if (event.target?.dataset?.save !== 'now') return
    event.stopPropagation()
    saver.immediate(snapshot())
  })

  paint()
  return {
    dispose: () => saver.dispose(),
  }
}
