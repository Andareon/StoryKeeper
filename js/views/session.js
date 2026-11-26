import {
  attitudeOf,
  byOrder,
  PLAYER_ATTITUDES,
  CLUE_STATUSES,
  CLUE_TYPES,
  closenessWord,
  cluesAt,
  DIALOGUE_KINDS,
  isDiscovered,
  labelOf,
  normalizeNote,
  normalizeSession,
  personName,
  playerTitle,
  relationLabel,
  VISIBILITY,
} from '../domain.js'
import { campaignHash } from '../router.js'
import { saveClue, savePlain } from '../services/persist.js'
import { esc, formatStamp, formatWhen, icon, mountIcons, objectUrl, todayInput } from '../ui/html.js'
import { graphKeyHtml, mountNpcGraph, rasterizePortrait } from '../ui/npc-graph.js'
import { toast } from '../ui/toast.js'

export function mountSession(host, ctx) {
  const cache = ctx.db.cache
  let focusKind = ctx.route.focusKind
  let entityId = ctx.route.entityId
  let graph = null
  let readToken = 0
  let portraitUrls = []
  if (!entityId) {
    const locations = byOrder(cache.locations)
    if (locations[0]) {
      focusKind = 'locations'
      entityId = locations[0].id
    } else if (byOrder(cache.characters)[0]) {
      focusKind = 'people'
      entityId = byOrder(cache.characters)[0].id
    }
  }
  const openGroups = new Set([focusKind || 'locations'])
  host.innerHTML = `
    <div class="session">
      <div class="session-tools">
        <button type="button" class="btn btn-ghost btn-small" data-focus>${icon('panel-left-close')}Скрыть список</button>
      </div>
      <div class="session-body">
        <aside class="session-rail" id="session-rail"></aside>
        <article class="session-read" id="session-read"></article>
        <aside class="session-side">
          <section class="block">
            <h3>Быстрая заметка</h3>
            <select class="control" id="note-target"></select>
            <textarea class="control" id="note-text" rows="4" placeholder="Что только что произошло" spellcheck="true"></textarea>
            <button type="button" class="btn btn-small" id="note-save">${icon('plus')}Записать</button>
          </section>
          <section class="block" id="session-clues"></section>
        </aside>
      </div>
    </div>`
  const root = host.querySelector('.session')
  const focusBtn = host.querySelector('[data-focus]')
  focusBtn.onclick = () => {
    const hidden = root.classList.toggle('is-focus')
    focusBtn.innerHTML = hidden
      ? `${icon('panel-left-open')}Показать список`
      : `${icon('panel-left-close')}Скрыть список`
    mountIcons(focusBtn)
  }
  function targets() {
    const select = host.querySelector('#note-target')
    const current = select.value
    const options = [
      ['session', 'В текущую сессию'],
      ['note', 'Новой заметкой'],
      ...byOrder(cache.players, 'characterName').map((player) => [`player:${player.id}`, `Игроку: ${playerTitle(player)}`]),
    ]
    select.innerHTML = options.map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join('')
    if ([...select.options].some((option) => option.value === current)) select.value = current
  }
  function paintRail() {
    const rail = host.querySelector('#session-rail')
    rail.innerHTML = [
      railGroup('Локации', 'locations', byOrder(cache.locations), (item) => item.name || 'Без названия', 'Нет локаций'),
      railGroup('Персонажи', 'people', byOrder(cache.characters), (item) => item.name || 'Без имени', 'Нет персонажей', attitudeMark),
      railGroup('Улики и предметы', 'clues', byOrder(cache.clues), (item) => item.name || 'Без названия', 'Нет улик', clueMark),
      railGroup('Игроки', 'players', byOrder(cache.players, 'characterName'), (item) => playerTitle(item), 'Нет игроков'),
      railGroup('Заметки', 'notes', byOrder(cache.notes, 'title'), (item) => item.title || 'Без названия', 'Нет заметок'),
    ].join('')
    rail.querySelectorAll('.rail-btn').forEach((button) => {
      button.onclick = () => open(button.dataset.kind, button.dataset.id)
    })
    rail.querySelectorAll('[data-fold]').forEach((button) => {
      button.onclick = () => {
        const kind = button.dataset.fold
        if (openGroups.has(kind)) openGroups.delete(kind)
        else openGroups.add(kind)
        paintRail()
      }
    })
    mountIcons(rail)
  }
  function railGroup(title, kind, items, label, empty, mark) {
    const open = openGroups.has(kind)
    const buttons = items.map((item) => {
      const active = focusKind === kind && item.id === entityId ? ' is-active' : ''
      let badge = ''
      if (mark) {
        const sign = mark(item)
        badge = `<span class="rail-mark ${sign.className}" title="${esc(sign.title)}">${icon(sign.icon)}</span>`
      }
      return `<button type="button" class="rail-btn${active}" data-kind="${kind}" data-id="${esc(item.id)}">${badge}<span class="rail-label">${esc(label(item))}</span></button>`
    }).join('')
    const body = open ? (buttons || `<p class="hint">${empty}</p>`) : ''
    return `<section class="rail-group">
      <button type="button" class="rail-fold${open ? ' is-open' : ''}" data-fold="${kind}" aria-expanded="${open}">
        <span>${title}</span>
        <span class="kicker">${items.length}</span>
      </button>
      ${body}
    </section>`
  }
  function open(kind, id) {
    focusKind = kind
    entityId = id
    openGroups.add(kind)
    ctx.replaceHash(campaignHash(ctx.id, 'session', id, kind))
    paintRail()
    paintRead()
    paintClues()
  }
  function revokePortraits() {
    for (const url of portraitUrls) URL.revokeObjectURL(url)
    portraitUrls = []
  }
  async function portraitUrl(id) {
    if (!id) return ''
    const image = await ctx.db.getImage(id)
    if (!image?.data) return ''
    if ((image.mime || '').includes('svg')) return rasterizePortrait(image)
    const url = objectUrl(image)
    if (url) portraitUrls.push(url)
    return url
  }
  async function shotUrls(ids) {
    const urls = []
    for (const id of ids || []) {
      const url = await portraitUrl(id)
      if (url) urls.push(url)
    }
    return urls
  }
  async function paintRead() {
    const token = ++readToken
    graph?.destroy()
    graph = null
    revokePortraits()
    const read = host.querySelector('#session-read')
    let html = '<p class="hint">Слева выберите локацию, персонажа, улику, игрока или заметку.</p>'
    let showGraph = false
    let ego = false
    let highlightId = ''
    if (focusKind === 'people') {
      const character = cache.characters.find((item) => item.id === entityId)
      const url = character ? await portraitUrl(character.portraitId) : ''
      if (token !== readToken) {
        revokePortraits()
        return
      }
      html = character ? characterHtml(character, url, cache) : '<p class="hint">Персонаж не найден.</p>'
      showGraph = Boolean(character)
      ego = true
      highlightId = character?.id || ''
    } else if (focusKind === 'players') {
      const player = cache.players.find((item) => item.id === entityId)
      const url = player ? await portraitUrl(player.portraitId) : ''
      if (token !== readToken) {
        revokePortraits()
        return
      }
      html = player ? playerHtml(player, url) : '<p class="hint">Игрок не найден.</p>'
      showGraph = Boolean(player)
    } else if (focusKind === 'notes') {
      const note = cache.notes.find((item) => item.id === entityId)
      html = note ? noteHtml(note, cache) : '<p class="hint">Заметка не найдена.</p>'
    } else if (focusKind === 'clues') {
      const clue = cache.clues.find((item) => item.id === entityId)
      const picture = clue?.imageId ? await portraitUrl(clue.imageId) : ''
      if (token !== readToken) {
        revokePortraits()
        return
      }
      html = clue ? clueHtml(clue, cache, picture) : '<p class="hint">Улика не найдена.</p>'
    } else {
      const location = cache.locations.find((item) => item.id === entityId)
      const shots = location ? await shotUrls(location.imageIds) : []
      if (token !== readToken) {
        revokePortraits()
        return
      }
      if (location) html = locationHtml(location, cache, shots)
    }
    read.innerHTML = html
    mountIcons(read)
    read.querySelectorAll('[data-attitude]').forEach((button) => {
      button.onclick = async () => {
        const character = cache.characters.find((item) => item.id === entityId)
        if (!character || character.playerAttitude === button.dataset.attitude) return
        ctx.setStatus('saving')
        try {
          await savePlain(ctx.db, 'characters', { ...character, playerAttitude: button.dataset.attitude })
          ctx.setStatus('saved')
          read.querySelectorAll('[data-attitude]').forEach((item) => {
            item.classList.toggle('is-on', item.dataset.attitude === button.dataset.attitude)
          })
          paintRail()
        } catch (error) {
          ctx.setStatus('error', error)
        }
      }
    })
    if (!showGraph) return
    const section = document.createElement('section')
    section.className = 'session-rel'
    section.innerHTML = `<h3>${ego ? 'Отношения' : 'Отношения персонажей'}</h3>${graphKeyHtml()}<div class="session-graph"></div><p class="hint" data-edge-note>Нажмите на линию, чтобы прочитать связь.</p>`
    read.appendChild(section)
    let handle
    try {
      handle = await mountNpcGraph(section.querySelector('.session-graph'), ctx, {
        highlightId: ego ? highlightId : '',
        ego,
        onEdge(rel) {
          const note = section.querySelector('[data-edge-note]')
          if (!note) return
          const facts = [relationLabel(rel), closenessWord(rel.closeness), labelOf(VISIBILITY, rel.visibility)].filter(Boolean)
          const text = `${personName(cache, rel.fromId)} и ${personName(cache, rel.toId)}: ${facts.join(' · ')}`
          note.textContent = rel.description ? `${text}. ${rel.description}` : text
        },
      })
    } catch (error) {
      console.error(error)
      if (token !== readToken) return
      const failed = section.querySelector('[data-edge-note]')
      if (failed) failed.textContent = 'Схему не удалось показать.'
      return
    }
    if (token !== readToken || !section.isConnected) {
      handle.destroy()
      return
    }
    const note = section.querySelector('[data-edge-note]')
    if (note && !handle.edges) {
      note.textContent = ego ? 'Связей с другими персонажами пока нет.' : 'Связей между персонажами пока нет.'
    }
    graph = handle
  }
  function paintClues() {
    const box = host.querySelector('#session-clues')
    let clues = cache.clues
    let title = 'Все улики'
    if (focusKind === 'locations' && entityId) {
      clues = cluesAt(cache.clues, entityId)
      title = 'Находки здесь'
    } else if (focusKind === 'people' && entityId) {
      const character = cache.characters.find((item) => item.id === entityId)
      const ids = new Set(character?.clueIds || [])
      clues = cache.clues.filter((clue) => ids.has(clue.id) || (clue.characterIds || []).includes(entityId))
      title = 'Улики персонажа'
    } else if (focusKind === 'notes' && entityId) {
      const note = cache.notes.find((item) => item.id === entityId)
      const ids = new Set(note?.clueIds || [])
      clues = cache.clues.filter((clue) => ids.has(clue.id))
      title = 'Улики заметки'
    } else if (focusKind === 'clues' && entityId) {
      clues = cache.clues.filter((clue) => clue.id === entityId)
      title = 'Статус'
    } else if (focusKind === 'players') {
      clues = []
      title = 'Улики'
    }
    box.innerHTML = `
      <h3>${esc(title)}</h3>
      ${clues.map((clue) => `
        <article class="clue-quick">
          <header>
            <strong>${esc(clue.name || 'Без названия')}</strong>
            <span class="kicker">${esc(labelOf(CLUE_STATUSES, clue.status))}</span>
          </header>
          <div class="status-picks">
            ${CLUE_STATUSES.map(([status, label]) => `<button type="button" class="btn btn-ghost btn-small${clue.status === status ? ' is-on' : ''}" data-clue="${esc(clue.id)}" data-status="${status}">${esc(label)}</button>`).join('')}
          </div>
        </article>`).join('') || `<p class="hint">${focusKind === 'players' ? 'Отметки улик есть у локации и персонажа.' : 'Нет улик для этой карточки.'}</p>`}`
    box.querySelectorAll('[data-clue]').forEach((button) => {
      button.onclick = async () => {
        const clue = cache.clues.find((item) => item.id === button.dataset.clue)
        if (!clue || clue.status === button.dataset.status) return
        ctx.setStatus('saving')
        try {
          await saveClue(ctx.db, { ...clue, status: button.dataset.status })
          ctx.setStatus('saved')
          paintClues()
          paintRail()
          if (focusKind === 'locations' || focusKind === 'clues') paintRead()
        } catch (error) {
          ctx.setStatus('error', error)
        }
      }
    })
  }
  host.querySelector('#note-save').onclick = async () => {
    const text = host.querySelector('#note-text').value.trim()
    if (!text) return
    const target = host.querySelector('#note-target').value
    ctx.setStatus('saving')
    try {
      if (target === 'session') await appendSession(ctx, text)
      else if (target === 'note') {
        await savePlain(ctx.db, 'notes', normalizeNote({
          title: text.slice(0, 60),
          text,
        }))
      } else if (target.startsWith('player:')) {
        const player = cache.players.find((item) => item.id === target.slice(7))
        if (player) {
          await savePlain(ctx.db, 'players', {
            ...player,
            revealedInfo: [{ id: crypto.randomUUID(), text, at: new Date().toISOString() }, ...(player.revealedInfo || [])],
          })
        }
      }
      host.querySelector('#note-text').value = ''
      ctx.setStatus('saved')
      toast('Заметка записана.')
      targets()
      paintRail()
      const wroteToOpenPlayer = target.startsWith('player:') && focusKind === 'players' && entityId === target.slice(7)
      if (wroteToOpenPlayer || focusKind === 'notes') paintRead()
    } catch (error) {
      ctx.setStatus('error', error)
    }
  }
  targets()
  paintRail()
  paintRead()
  paintClues()
  mountIcons(host)
  return {
    destroy() {
      graph?.destroy()
      graph = null
      revokePortraits()
    },
  }
}

function playerHtml(player, portrait) {
  const facts = [player.classRole, player.race, player.age].filter(Boolean).join(' · ')
  const inventory = player.inventory || []
  const told = player.revealedInfo || []
  const name = playerTitle(player)
  return `
    <div class="session-head">
      ${portraitHtml(portrait, name)}
      <div class="session-head-copy">
        <p class="kicker">${esc(player.playerName ? `Игрок ${player.playerName}` : 'Игрок')}</p>
        <h2>${esc(name)}</h2>
        ${facts ? `<p class="lede">${esc(facts)}</p>` : ''}
      </div>
    </div>
    ${player.appearance ? `<h3>Внешность</h3>${prose(player.appearance)}` : ''}
    ${player.personality ? `<h3>Характер</h3>${prose(player.personality)}` : ''}
    ${player.biography ? `<h3>Биография</h3>${prose(player.biography)}` : ''}
    ${player.goals ? `<h3>Цели</h3>${prose(player.goals)}` : ''}
    ${player.motives ? `<h3>Мотивы</h3>${prose(player.motives)}` : ''}
    ${player.abilities ? `<h3>Способности</h3>${prose(player.abilities)}` : ''}
    ${inventory.length ? `<h3>Инвентарь</h3><ul class="plain-list">${inventory.map((item) => `<li><strong>${esc(item.name || 'Предмет')}</strong> ${esc(item.notes || '')}</li>`).join('')}</ul>` : ''}
    <h3>Сведения с сессии</h3>
    ${told.length ? told.map((entry) => `<p class="kicker">${esc(formatStamp(entry.at))}</p>${prose(entry.text)}`).join('') : '<p class="hint">Пока ничего не записано.</p>'}
    ${player.notes ? `<h3>Заметки ведущего</h3>${prose(player.notes)}` : ''}`
}

function noteHtml(note, cache) {
  const places = namesOf(cache.locations, note.locationIds)
  const people = namesOf(cache.characters, note.characterIds)
  const clues = namesOf(cache.clues, note.clueIds)
  const tags = (note.tags || []).filter(Boolean)
  return `
    <p class="kicker">Заметка · ${esc(formatWhen(note.createdAt))}</p>
    <h2>${esc(note.title || 'Без названия')}</h2>
    ${prose(note.text) || '<p class="hint">Текст ещё не записан.</p>'}
    ${tags.length ? `<p class="kicker">${esc(tags.join(' · '))}</p>` : ''}
    ${places.length ? `<h3>Локации</h3><p>${esc(places.join(', '))}</p>` : ''}
    ${people.length ? `<h3>Персонажи</h3><p>${esc(people.join(', '))}</p>` : ''}
    ${clues.length ? `<h3>Улики</h3><p>${esc(clues.join(', '))}</p>` : ''}`
}

function namesOf(list, ids) {
  const wanted = new Set(ids || [])
  return (list || []).filter((item) => wanted.has(item.id)).map((item) => item.name).filter(Boolean)
}

function locationHtml(location, cache, shots = []) {
  const people = byOrder(cache.characters).filter((character) => (location.characterIds || []).includes(character.id))
  const linked = namesOf(cache.locations, location.linkedLocationIds)
  return `
    <p class="kicker">Локация</p>
    <h2>${esc(location.name || 'Без названия')}</h2>
    ${shotStrip(shots)}
    ${location.shortDescription ? `<p class="lede">${esc(location.shortDescription)}</p>` : ''}
    ${prose(location.gmDescription)}
    ${tagLine(location.tags)}
    ${people.length ? `<h3>Кто здесь</h3><p>${esc(people.map((character) => character.name).join(', '))}</p>` : ''}
    ${nameLine('Связанные локации', linked)}
    ${secretList(location.secrets, 'Секреты')}
    ${eventList(location.events)}
    ${section('Заметки ведущего', location.notes)}`
}

function attitudeMark(character) {
  const attitude = attitudeOf(character.playerAttitude)
  return { icon: attitude[2], className: `is-${attitude[0]}`, title: attitude[1] }
}

function clueMark(clue) {
  const found = isDiscovered(clue.status)
  return {
    icon: found ? 'check' : 'eye-off',
    className: found ? 'is-found' : '',
    title: found ? 'Игроки уже нашли' : 'Игроки ещё не нашли',
  }
}

function clueHtml(clue, cache, picture = '') {
  const placeIds = new Set([clue.discoveryLocationId, ...(clue.locationIds || [])].filter(Boolean))
  const places = cache.locations.filter((item) => placeIds.has(item.id)).map((item) => item.name).filter(Boolean)
  const people = namesOf(cache.characters, clue.characterIds)
  const linked = namesOf(cache.clues, clue.linkedClueIds)
  return `
    <p class="kicker">${esc(labelOf(CLUE_TYPES, clue.type))} · ${esc(labelOf(CLUE_STATUSES, clue.status))}</p>
    <h2>${esc(clue.name || 'Без названия')}</h2>
    ${shotStrip(picture ? [picture] : [])}
    ${tagLine(clue.tags)}
    ${clue.description ? prose(clue.description) : '<p class="hint">Описание ещё не записано.</p>'}
    ${clue.reveals ? `<h3>Что открывает</h3>${prose(clue.reveals)}` : ''}
    ${clue.history ? `<h3>История</h3>${prose(clue.history)}` : ''}
    ${places.length ? `<h3>Где встречается</h3><p>${esc(places.join(', '))}</p>` : ''}
    ${people.length ? `<h3>Кто связан</h3><p>${esc(people.join(', '))}</p>` : ''}
    ${nameLine('Связанные улики', linked)}
    ${section('Заметки ведущего', clue.notes)}`
}

function characterHtml(character, portrait, cache) {
  const dialogues = character.dialogues || []
  const name = character.name || 'Без имени'
  const role = character.role || 'Персонаж'
  const kicker = character.age ? `${role} · ${character.age}` : role
  const places = namesOf(cache.locations, character.locationIds)
  return `
    <div class="session-head">
      ${portraitHtml(portrait, name)}
      <div class="session-head-copy">
        <p class="kicker">${esc(kicker)}</p>
        <h2>${esc(name)}</h2>
        ${dontSay(character.hides)}
        <p class="lbl">Отношение к игрокам</p>
        <div class="status-picks">
          ${PLAYER_ATTITUDES.map(([value, label, face]) => `<button type="button" class="btn btn-ghost btn-small${character.playerAttitude === value ? ' is-on' : ''}" data-attitude="${value}">${icon(face)}${esc(label)}</button>`).join('')}
        </div>
      </div>
    </div>
    ${character.shortDescription ? `<p class="lede">${esc(character.shortDescription)}</p>` : ''}
    ${tagLine(character.tags)}
    ${section('Манера речи', character.speech)}
    <h3>Темы разговора</h3>
    ${dialogues.map((topic) => `
      <article class="dialogue">
        <p class="kicker">${esc(labelOf(DIALOGUE_KINDS, topic.kind))}${topic.title ? ` · ${esc(topic.title)}` : ''}</p>
        ${prose(topic.text || 'Текст ответа ещё не записан.')}
      </article>`).join('') || '<p class="hint">Темы разговора не заполнены.</p>'}
    ${section('Знает', character.knows)}
    ${section('Может рассказать', character.canTell)}
    ${section('Внешность', character.appearance)}
    ${section('Характер', character.personality)}
    ${section('Биография', character.biography)}
    ${section('Мотивация', character.motivation)}
    ${section('Цели', character.goals)}
    ${section('Секреты', character.secrets)}
    ${nameLine('Где бывает', places)}
    ${section('Заметки ведущего', character.notes)}`
}

function dontSay(text) {
  const value = String(text || '').trim()
  if (!value) return ''
  return `<aside class="dont-say"><span class="lbl">Не говорить</span>${esc(value)}</aside>`
}

function portraitHtml(url, name) {
  if (url) return `<img class="session-portrait" src="${esc(url)}" alt="">`
  return `<div class="session-portrait is-empty" aria-hidden="true">${esc(initials(name))}</div>`
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return parts.slice(0, 2).map((part) => part[0]).join('')
}

function prose(text) {
  if (!text) return ''
  return text.split(/\n{2,}/).map((part) => `<p class="prose">${esc(part).replaceAll('\n', '<br>')}</p>`).join('')
}

function secretList(secrets, title) {
  if (!secrets?.length) return ''
  return `<h3>${title}</h3><ul class="plain-list">${secrets.map((secret) => `<li>${secret.revealed ? '' : 'Скрыто. '}${esc(secret.text || '')}</li>`).join('')}</ul>`
}

function eventList(events) {
  if (!events?.length) return ''
  return `<h3>События</h3><ul class="plain-list">${events.map((event) => `<li><strong>${esc(event.title || 'Событие')}</strong> ${event.happened ? 'Уже произошло. ' : 'Ещё не произошло. '}${esc(event.text || '')}</li>`).join('')}</ul>`
}

function section(title, text) {
  if (!String(text || '').trim()) return ''
  return `<h3>${esc(title)}</h3>${prose(text)}`
}

function nameLine(title, names) {
  if (!names?.length) return ''
  return `<h3>${esc(title)}</h3><p>${esc(names.join(', '))}</p>`
}

function tagLine(tags) {
  const list = (tags || []).map((tag) => String(tag || '').trim()).filter(Boolean)
  if (!list.length) return ''
  return `<p class="kicker">${esc(list.join(' · '))}</p>`
}

function shotStrip(urls) {
  if (!urls?.length) return ''
  return `<div class="session-shots">${urls.map((url) => `<img class="session-shot" src="${esc(url)}" alt="">`).join('')}</div>`
}

async function appendSession(ctx, text) {
  const sessions = ctx.db.cache.sessions
  let current = [...sessions].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))[0]
  if (!current) {
    current = await savePlain(ctx.db, 'sessions', normalizeSession({
      number: 1,
      date: todayInput(),
      title: 'Сессия 1',
      events: [{ id: crypto.randomUUID(), text }],
    }))
    return current
  }
  return savePlain(ctx.db, 'sessions', {
    ...current,
    events: [...(current.events || []), { id: crypto.randomUUID(), text }],
  })
}
