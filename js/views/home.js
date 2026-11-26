import { createCampaign, deleteCampaign, duplicateCampaign, openCampaign } from '../db/campaign.js'
import { listCampaigns } from '../db/registry.js'
import { GAME_STATUSES, labelOf, MAX_IMAGE_BYTES } from '../domain.js'
import { campaignHash } from '../router.js'
import { createSampleCampaign } from '../services/seed.js'
import { exportCampaignToBlob, fileSlug, importCampaignFromBlob } from '../services/transfer.js'
import { confirmDialog, modal } from '../ui/modal.js'
import { downloadBlob } from '../ui/download.js'
import { esc, field, formatStamp, formatWhen, icon, inp, sel, ta } from '../ui/html.js'
import { toast } from '../ui/toast.js'

function gameStamp(game, games) {
  const name = (game.name || '').trim()
  const same = games.filter((item) => (item.name || '').trim() === name)
  if (same.length < 2) return formatWhen(game.updatedAt)
  const stamp = formatStamp(game.updatedAt)
  const clash = same.some((item) => item.id !== game.id && formatStamp(item.updatedAt) === stamp)
  if (!clash) return `изменена ${stamp}`
  const ordered = [...same].sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)) || a.id.localeCompare(b.id))
  const place = ordered.findIndex((item) => item.id === game.id) + 1
  return `изменена ${stamp} · ${place}`
}

export async function renderHome(app, { navigate }) {
  app.innerHTML = `
    <div class="home">
      <header class="home-head">
        <div>
          <p class="kicker">Стол ведущего</p>
          <h1>StoryKeeper</h1>
        </div>
        <div class="home-actions">
          <button type="button" class="btn btn-ghost" data-sample>${icon('book-open')}Пример игры</button>
          <button type="button" class="btn btn-ghost" data-import>${icon('upload')}Импорт</button>
          <button type="button" class="btn" data-create>${icon('plus')}Новая игра</button>
          <input type="file" accept=".zip,application/zip" hidden data-file>
        </div>
      </header>
      <div class="game-list" id="game-list"><p class="hint">Открываем библиотеку…</p></div>
    </div>`
  const list = app.querySelector('#game-list')
  let urls = []
  const revoke = () => {
    urls.forEach((url) => URL.revokeObjectURL(url))
    urls = []
  }
  async function paint() {
    revoke()
    const games = await listCampaigns()
    if (!games.length) {
      list.innerHTML = `<div class="empty-card"><p>Пока нет ни одной игры.</p><p class="hint">Создайте кампанию или откройте пример расследования «Дом на Вересковой улице».</p></div>`
      return
    }
    list.innerHTML = games.map((game) => {
      let cover = ''
      if (game.coverData) {
        const url = URL.createObjectURL(new Blob([game.coverData], { type: game.coverMime || 'image/png' }))
        urls.push(url)
        cover = `<img src="${esc(url)}" alt="">`
      }
      const counts = game.counts || {}
      return `
        <article class="game-card">
          <div class="game-cover">${cover || `<div class="cover-fallback">${esc((game.name || 'И').slice(0, 1))}</div>`}</div>
          <div class="game-body">
            <div class="row-between">
              <h2>${esc(game.name || 'Без названия')}</h2>
              <span class="pill">${esc(labelOf(GAME_STATUSES, game.status || 'draft'))}</span>
            </div>
            <p class="game-desc">${esc(game.description || 'Без описания')}</p>
            <p class="game-meta">
              <span>${counts.locations || 0} лок.</span>
              <span>${counts.characters || 0} персонажей</span>
              <span>${counts.clues || 0} улик</span>
              <span>${esc(gameStamp(game, games))}</span>
            </p>
            <div class="game-actions">
              <button type="button" class="btn btn-small" data-act="open" data-id="${esc(game.id)}">Открыть</button>
              <button type="button" class="text-btn" data-act="edit" data-id="${esc(game.id)}">Править</button>
              <button type="button" class="text-btn" data-act="copy" data-id="${esc(game.id)}">Копия</button>
              <button type="button" class="text-btn" data-act="export" data-id="${esc(game.id)}">Экспорт</button>
              <button type="button" class="text-btn danger is-apart" data-act="delete" data-id="${esc(game.id)}">Удалить</button>
            </div>
          </div>
        </article>`
    }).join('')
    list.querySelectorAll('[data-act]').forEach((button) => {
      button.onclick = () => act(button.dataset.act, button.dataset.id)
    })
  }
  async function act(type, id) {
    const games = await listCampaigns()
    const game = games.find((item) => item.id === id)
    if (!game) return
    try {
      if (type === 'open') {
        navigate(campaignHash(id, 'overview'))
        return
      }
      if (type === 'edit') await editGame(game, paint)
      if (type === 'copy') {
        await duplicateCampaign(id)
        toast('Игра скопирована.')
        await paint()
      }
      if (type === 'export') {
        const blob = await exportCampaignToBlob(id)
        downloadBlob(blob, fileSlug(game.name))
        toast('Архив скачан.')
      }
      if (type === 'delete') {
        const ok = await confirmDialog({
          title: 'Удалить игру',
          text: `Удалить «${game.name}» и все её данные? Это нельзя отменить.`,
        })
        if (!ok) return
        await deleteCampaign(id)
        toast('Игра удалена.')
        await paint()
      }
    } catch (error) {
      toast(error.message || 'Действие не выполнено.', 'error')
    }
  }
  app.querySelector('[data-create]').onclick = () => createGame(navigate, paint)
  app.querySelector('[data-sample]').onclick = async () => {
    try {
      const record = await createSampleCampaign()
      toast('Пример добавлен в библиотеку.')
      navigate(campaignHash(record.id, 'overview'))
    } catch (error) {
      toast(error.message || 'Не удалось создать пример.', 'error')
    }
  }
  const file = app.querySelector('[data-file]')
  app.querySelector('[data-import]').onclick = () => file.click()
  file.onchange = async () => {
    const picked = file.files?.[0]
    file.value = ''
    if (!picked) return
    try {
      const record = await importCampaignFromBlob(picked)
      toast(`Импортировано: ${record.name}`)
      await paint()
    } catch (error) {
      toast(error.message || 'Импорт не удался.', 'error')
    }
  }
  await paint()
  return revoke
}

function createGame(navigate, paint) {
  let cover = null
  modal({
    title: 'Новая игра',
    content: `
      ${field('Название', inp('name', '', { placeholder: 'Название кампании' }))}
      ${field('Описание', ta('description', '', 4, 'О чём история'))}
      <label class="btn btn-ghost btn-small">Обложка<input type="file" accept="image/*" hidden data-cover></label>
      <p class="hint" data-cover-name>Файл не выбран</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-close-modal>Отмена</button>
        <button type="button" class="btn" data-ok>Создать</button>
      </div>`,
    onMount(wrap, close) {
      wrap.querySelector('[data-cover]').onchange = (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/') || file.size > MAX_IMAGE_BYTES) {
          toast(file.size > MAX_IMAGE_BYTES ? 'Изображение больше 15 МБ.' : 'Нужен файл изображения.', 'error')
          event.target.value = ''
          cover = null
          return
        }
        cover = file
        wrap.querySelector('[data-cover-name]').textContent = file.name
      }
      wrap.querySelector('[data-close-modal]').onclick = close
      wrap.querySelector('[data-ok]').onclick = async () => {
        try {
          const record = await createCampaign({
            name: wrap.querySelector('[name="name"]').value,
            description: wrap.querySelector('[name="description"]').value,
            coverFile: cover,
          })
          close()
          navigate(campaignHash(record.id, 'overview'))
        } catch (error) {
          toast(error.message || 'Не удалось создать игру.', 'error')
        }
      }
    },
  })
  void paint
}

async function editGame(game, paint) {
  let cover = null
  let removeCover = false
  modal({
    title: 'Об игре',
    content: `
      ${field('Название', inp('name', game.name || ''))}
      ${field('Описание', ta('description', game.description || '', 4))}
      ${field('Статус', sel('status', game.status || 'draft', GAME_STATUSES))}
      <label class="btn btn-ghost btn-small">Новая обложка<input type="file" accept="image/*" hidden data-cover></label>
      <p class="hint" data-cover-name>${game.coverData ? 'Обложка уже есть' : 'Обложки нет'}</p>
      <label class="check"><input type="checkbox" data-clear><span>Убрать обложку</span></label>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-close-modal>Отмена</button>
        <button type="button" class="btn" data-ok>Сохранить</button>
      </div>`,
    onMount(wrap, close) {
      wrap.querySelector('[data-cover]').onchange = (event) => {
        const file = event.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/') || file.size > MAX_IMAGE_BYTES) {
          toast('Выберите изображение до 15 МБ.', 'error')
          event.target.value = ''
          return
        }
        cover = file
        removeCover = false
        wrap.querySelector('[data-clear]').checked = false
        wrap.querySelector('[data-cover-name]').textContent = file.name
      }
      wrap.querySelector('[data-clear]').onchange = (event) => {
        removeCover = event.target.checked
        if (removeCover) cover = null
      }
      wrap.querySelector('[data-close-modal]').onclick = close
      wrap.querySelector('[data-ok]').onclick = async () => {
        const db = await openCampaign(game.id)
        try {
          await db.loadAll()
          await db.putMeta({
            ...db.cache.meta,
            name: wrap.querySelector('[name="name"]').value.trim() || 'Без названия',
            description: wrap.querySelector('[name="description"]').value,
            status: wrap.querySelector('[name="status"]').value,
          })
          if (cover) await db.setCover(cover)
          else if (removeCover) await db.setCover(null)
          else await db.touch()
          close()
          await paint()
        } catch (error) {
          toast(error.message || 'Не удалось сохранить.', 'error')
        } finally {
          if (db.isOpen()) db.close()
        }
      }
    },
  })
}
