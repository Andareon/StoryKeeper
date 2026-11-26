import { GAME_STATUSES, MAX_IMAGE_BYTES } from '../domain.js'
import { FORMAT_VERSION, SCHEMA_VERSION } from '../db/schema.js'
import { deleteCampaign } from '../db/campaign.js'
import { exportCampaignToBlob, fileSlug } from '../services/transfer.js'
import { createSaver } from '../services/autosave.js'
import { confirmDialog } from '../ui/modal.js'
import { toast } from '../ui/toast.js'
import { objectUrl } from '../ui/html.js'
import {
  bindSaver,
  block,
  esc,
  field,
  icon,
  inp,
  mountIcons,
  readControls,
  sel,
  ta,
} from '../ui/html.js'
import { downloadBlob } from '../ui/download.js'

export function mountSettings(host, ctx) {
  const meta = ctx.db.cache.meta || {}
  host.innerHTML = `
    <div class="view-scroll stack narrow">
      ${block('Игра', `
        ${field('Название', inp('name', meta.name))}
        ${field('Описание', ta('description', meta.description, 5))}
        ${field('Статус', sel('status', meta.status || 'draft', GAME_STATUSES))}
        <div class="field"><span class="lbl">Обложка</span><div id="cover-preview"></div>
          <label class="btn btn-ghost btn-small">${icon('image-plus')}Выбрать изображение<input type="file" accept="image/*" hidden data-cover></label>
          <button type="button" class="text-btn danger" data-clear-cover>Убрать обложку</button>
        </div>
      `)}
      ${block('Архив', `
        <p class="hint">ZIP содержит все карточки и изображения этой игры. Импорт создаёт отдельную копию и не затирает остальные кампании.</p>
        <button type="button" class="btn" data-export>${icon('download')}Экспортировать игру</button>
      `)}
      ${block('Формат', `
        <p class="hint">Версия формата архива: ${FORMAT_VERSION}. Версия базы: ${SCHEMA_VERSION}.</p>
      `)}
      <div class="danger-row">
        <button type="button" class="btn btn-danger" data-delete>${icon('trash-2')}Удалить игру</button>
      </div>
    </div>`
  const saver = createSaver({
    async save(draft) {
      const next = await ctx.db.putMeta({ ...ctx.db.cache.meta, ...draft })
      await ctx.db.touch()
      ctx.record.name = next.name
      ctx.setTitle(next.name)
    },
    onStatus: ctx.setStatus,
  })
  function collect() {
    const values = readControls(host, ['name', 'description', 'status'])
    return { ...values, name: values.name.trim() || 'Без названия' }
  }
  bindSaver(host, collect, saver)
  paintCover()
  host.querySelector('[data-cover]').onchange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('Нужен файл изображения.', 'error')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast('Изображение больше 15 МБ. Выберите файл меньше.', 'error')
      return
    }
    ctx.setStatus('saving')
    try {
      await saver.flush()
      await ctx.db.setCover(file)
      ctx.setTitle(ctx.db.cache.meta.name)
      ctx.setStatus('saved')
      paintCover()
    } catch (error) {
      ctx.setStatus('error', error)
    }
  }
  host.querySelector('[data-clear-cover]').onclick = async () => {
    ctx.setStatus('saving')
    try {
      await ctx.db.setCover(null)
      ctx.setStatus('saved')
      paintCover()
    } catch (error) {
      ctx.setStatus('error', error)
    }
  }
  host.querySelector('[data-export]').onclick = async () => {
    ctx.setStatus('saving')
    try {
      await saver.flush()
      if (ctx.saveKind === 'error') return
      const blob = await exportCampaignToBlob(ctx.id)
      downloadBlob(blob, fileSlug(ctx.db.cache.meta?.name))
      ctx.setStatus('saved')
      toast('Архив игры скачан.')
    } catch (error) {
      ctx.setStatus('error', error)
    }
  }
  host.querySelector('[data-delete]').onclick = async () => {
    const name = host.querySelector('[name="name"]').value.trim() || 'Без названия'
    const ok = await confirmDialog({
      title: 'Удалить игру',
      text: `Удалить «${name}» вместе со всеми локациями, персонажами и изображениями? Это нельзя отменить.`,
    })
    if (!ok) return
    try {
      await saver.dispose()
      await deleteCampaign(ctx.id)
      ctx.db = { isOpen: () => false, close() {} }
      ctx.go('#/')
    } catch (error) {
      toast(error.message || 'Не удалось удалить игру.', 'error')
    }
  }
  mountIcons(host)
  return { destroy: () => saver.dispose() }

  function paintCover() {
    const preview = host.querySelector('#cover-preview')
    const id = ctx.db.cache.meta?.coverImageId
    preview.innerHTML = '<p class="hint">Обложка не выбрана.</p>'
    if (!id) return
    ctx.db.getImage(id).then((image) => {
      if (!image?.data || !preview.isConnected) return
      const url = objectUrl(image)
      preview.innerHTML = `<img class="cover-preview" src="${esc(url)}" alt="">`
      preview.dataset.url = url
    })
  }
}
