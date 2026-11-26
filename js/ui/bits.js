import { campaignHash } from '../router.js'
import { esc } from './html.js'
import { confirmDialog } from './modal.js'

export function noteLinks(ctx, field, id) {
  const notes = (ctx.db.cache.notes || []).filter((note) => (note[field] || []).includes(id))
  if (!notes.length) return '<p class="hint">Нет связанных заметок.</p>'
  return `<div class="link-row">${notes.map((note) => `<button type="button" class="text-btn" data-goto="${campaignHash(ctx.id, 'notes', note.id)}">${esc(note.title || 'Заметка')}</button>`).join('')}</div>`
}

export async function confirmDelete(ctx, saver, api, { title, text, store, id }) {
  const ok = await confirmDialog({ title, text, confirmLabel: 'Удалить' })
  if (!ok) return
  await saver.flush()
  if (ctx.saveKind === 'error') return
  await ctx.db.deleteEntity(store, id)
  await api.removed()
}
