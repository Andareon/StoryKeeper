import { MAX_IMAGE_BYTES } from '../domain.js'
import { esc, icon, mountIcons, objectUrl } from './html.js'
import { toast } from './toast.js'

export function mountGallery(container, { db, ids, multiple, onChange }) {
  const state = { ids: [...(ids || []).filter(Boolean)] }
  let urls = []

  function revoke() {
    for (const url of urls) URL.revokeObjectURL(url)
    urls = []
  }

  async function paint() {
    revoke()
    const thumbs = []
    for (const id of state.ids) {
      const image = await db.getImage(id)
      const url = objectUrl(image)
      if (url) urls.push(url)
      thumbs.push({ id, url, name: image?.name || 'Изображение' })
    }
    container.innerHTML = `
      <div class="gallery">
        ${thumbs.map((thumb) => `
          <figure class="thumb">
            ${thumb.url ? `<img src="${esc(thumb.url)}" alt="${esc(thumb.name)}">` : '<div class="cover-fallback">Нет файла</div>'}
            <button type="button" class="icon-btn" data-remove="${esc(thumb.id)}" aria-label="Убрать изображение">${icon('x')}</button>
          </figure>`).join('')}
        <label class="thumb thumb-add">
          ${icon('image-plus')}
          <span>${multiple ? 'Добавить' : (state.ids.length ? 'Заменить' : 'Загрузить')}</span>
          <input type="file" accept="image/*" hidden>
        </label>
      </div>`
    mountIcons(container)
    container.querySelectorAll('[data-remove]').forEach((button) => {
      button.onclick = async () => {
        const id = button.dataset.remove
        state.ids = state.ids.filter((item) => item !== id)
        await db.deleteImage(id)
        onChange([...state.ids])
        await paint()
      }
    })
    const input = container.querySelector('input[type="file"]')
    input.onchange = async () => {
      const file = input.files?.[0]
      input.value = ''
      if (!file) return
      if (!file.type.startsWith('image/')) {
        toast('Нужен файл изображения.', 'error')
        return
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast('Изображение больше 15 МБ. Выберите файл меньше.', 'error')
        return
      }
      try {
        const image = await db.putImage({
          data: await file.arrayBuffer(),
          mime: file.type,
          name: file.name,
        })
        if (multiple) state.ids.push(image.id)
        else {
          const previous = state.ids[0]
          state.ids = [image.id]
          if (previous && previous !== image.id) await db.deleteImage(previous)
        }
        onChange([...state.ids])
        await paint()
      } catch (error) {
        toast(error.message || 'Не удалось сохранить изображение.', 'error')
      }
    }
  }

  return {
    read: () => [...state.ids],
    paint,
    destroy() {
      revoke()
    },
  }
}
