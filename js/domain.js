export const GAME_STATUSES = [
  ['draft', 'Черновик'],
  ['active', 'В игре'],
  ['paused', 'На паузе'],
  ['completed', 'Завершена'],
]

export const CLUE_STATUSES = [
  ['found', 'Найдено'],
  ['not_found', 'Нет'],
]

export const CLUE_TYPES = [
  ['clue', 'Улика'],
  ['item', 'Предмет'],
  ['document', 'Документ'],
  ['other', 'Другое'],
]

export const DIALOGUE_KINDS = [
  ['normal', 'Обычный разговор'],
  ['right_question', 'При правильном вопросе'],
  ['present_clue', 'При предъявлении улики'],
  ['high_trust', 'При высоком доверии'],
  ['event', 'При определённом событии'],
  ['custom', 'Своя тема'],
]

export const RELATION_TYPES = [
  ['friendship', 'Дружба'],
  ['love', 'Любовь'],
  ['kinship', 'Родство'],
  ['trust', 'Доверие'],
  ['distrust', 'Недоверие'],
  ['enmity', 'Вражда'],
  ['subordination', 'Подчинение'],
  ['exploitation', 'Использование'],
  ['secret_alliance', 'Тайный союз'],
  ['custom', 'Другое'],
]

export const VISIBILITY = [
  ['public', 'Известно участникам'],
  ['gm', 'Только ведущий'],
]

export const PLAYER_ATTITUDES = [
  ['hostile', 'Злится на игроков', 'angry'],
  ['cold', 'Холодный', 'frown'],
  ['neutral', 'Нейтральный', 'meh'],
  ['warm', 'Доброжелательный', 'smile'],
  ['fond', 'Рад игрокам', 'laugh'],
]

export const SECTIONS = [
  ['overview', 'Обзор', 'book-open'],
  ['locations', 'Локации', 'map'],
  ['people', 'Персонажи', 'users'],
  ['clues', 'Улики и предметы', 'gem'],
  ['players', 'Игроки', 'user-round'],
  ['relations', 'Отношения', 'network'],
  ['journal', 'Журнал сессий', 'scroll-text'],
  ['notes', 'Заметки', 'notebook-pen'],
  ['settings', 'Настройки', 'settings'],
]

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024

const LEGACY_FOUND = new Set(['studied', 'given', 'lost'])

export function labelOf(list, value) {
  return list.find((item) => item[0] === value)?.[1] || '—'
}

export function relationLabel(rel) {
  if (!rel) return '—'
  if (rel.type === 'custom' && rel.customType?.trim()) return rel.customType.trim()
  return labelOf(RELATION_TYPES, rel.type)
}

export function relationInDirection(relations, fromId, toId, exceptId = '') {
  if (!fromId || !toId || fromId === toId) return null
  return (relations || []).find((rel) => rel.id !== exceptId && rel.fromId === fromId && rel.toId === toId) || null
}

export function collapseDirections(relations) {
  const kept = []
  const removed = []
  const rewritten = []
  const seen = new Map()
  for (const rel of relations || []) {
    if (!rel?.fromId || !rel?.toId || rel.fromId === rel.toId) {
      kept.push(rel)
      continue
    }
    const key = `${rel.fromId}\0${rel.toId}`
    const previous = seen.get(key)
    if (!previous) {
      seen.set(key, rel)
      kept.push(rel)
      continue
    }
    const extra = String(rel.description || '').trim()
    if (extra && !String(previous.description || '').includes(extra)) {
      previous.description = [previous.description, extra].filter((part) => String(part || '').trim()).join('\n')
      if (!rewritten.includes(previous)) rewritten.push(previous)
    }
    if (rel.id) removed.push(rel.id)
  }
  return { kept, removed, rewritten }
}

export function attitudeOf(value) {
  return PLAYER_ATTITUDES.find((item) => item[0] === value) || PLAYER_ATTITUDES[2]
}

export function closenessWord(value) {
  const n = Number(value) || 0
  if (n <= -3) return 'Враждебность'
  if (n < 0) return 'Напряжение'
  if (n === 0) return 'Нейтрально'
  if (n <= 2) return 'Симпатия'
  return 'Близость'
}

export function isDiscovered(status) {
  return status === 'found'
}

export function cluesAt(clues, locationId) {
  return (clues || []).filter((clue) => (
    clue.discoveryLocationId === locationId || (clue.locationIds || []).includes(locationId)
  ))
}

export function progressOf(list) {
  const total = list?.length || 0
  const found = (list || []).filter((clue) => isDiscovered(clue.status)).length
  return { found, total }
}

export function playerTitle(player) {
  return player?.characterName?.trim() || player?.playerName?.trim() || 'Игрок'
}

export function byName(list, field = 'name') {
  return [...(list || [])].sort((a, b) => String(a?.[field] || '').localeCompare(String(b?.[field] || ''), 'ru', { sensitivity: 'base' }))
}

export function byOrder(list, field = 'name') {
  const rows = [...(list || [])]
  const ranked = rows.some((item) => Number.isFinite(item?.order))
  return rows.sort((a, b) => {
    if (ranked) {
      const ao = Number.isFinite(a?.order) ? a.order : Number.MAX_SAFE_INTEGER
      const bo = Number.isFinite(b?.order) ? b.order : Number.MAX_SAFE_INTEGER
      if (ao !== bo) return ao - bo
    }
    return String(a?.[field] || '').localeCompare(String(b?.[field] || ''), 'ru', { sensitivity: 'base' })
  })
}

export function appendOrder(list) {
  const numbers = (list || []).map((item) => item?.order).filter((value) => Number.isFinite(value))
  if (!numbers.length) return {}
  return { order: Math.max(...numbers) + 1 }
}

export function byNumberDesc(list) {
  return [...(list || [])].sort((a, b) => (Number(b?.number) || 0) - (Number(a?.number) || 0) || String(b?.date || '').localeCompare(String(a?.date || '')))
}

export function byUpdatedDesc(list) {
  return [...(list || [])].sort((a, b) => String(b?.updatedAt || '').localeCompare(String(a?.updatedAt || '')))
}

function fill(row, defaults) {
  const next = { ...defaults }
  if (row && typeof row === 'object') {
    for (const [key, value] of Object.entries(row)) {
      if (value !== undefined) next[key] = value
    }
  }
  for (const [key, value] of Object.entries(defaults)) {
    if (Array.isArray(value) && !Array.isArray(next[key])) next[key] = []
  }
  return next
}

export function normalizeLocation(row) {
  return fill(row, {
    name: '',
    shortDescription: '',
    gmDescription: '',
    notes: '',
    imageIds: [],
    characterIds: [],
    linkedLocationIds: [],
    secrets: [],
    events: [],
    tags: [],
  })
}

export function normalizeCharacter(row) {
  const next = fill(row, {
    name: '',
    portraitId: '',
    age: '',
    role: '',
    shortDescription: '',
    personality: '',
    appearance: '',
    biography: '',
    speech: '',
    motivation: '',
    goals: '',
    secrets: '',
    knows: '',
    hides: '',
    canTell: '',
    notes: '',
    locationIds: [],
    clueIds: [],
    dialogues: [],
    tags: [],
    playerAttitude: 'neutral',
  })
  if (!PLAYER_ATTITUDES.some(([value]) => value === next.playerAttitude)) next.playerAttitude = 'neutral'
  return next
}

export function normalizeClue(row) {
  const next = fill(row, {
    name: '',
    imageId: '',
    description: '',
    type: 'clue',
    discoveryLocationId: '',
    status: 'not_found',
    history: '',
    reveals: '',
    notes: '',
    characterIds: [],
    locationIds: [],
    linkedClueIds: [],
    tags: [],
  })
  if (LEGACY_FOUND.has(next.status)) next.status = 'found'
  if (!CLUE_STATUSES.some(([value]) => value === next.status)) next.status = 'not_found'
  if (!CLUE_TYPES.some(([value]) => value === next.type)) next.type = 'clue'
  return next
}

export function normalizePlayer(row) {
  return fill(row, {
    playerName: '',
    characterName: '',
    portraitId: '',
    classRole: '',
    race: '',
    age: '',
    appearance: '',
    personality: '',
    biography: '',
    goals: '',
    motives: '',
    abilities: '',
    notes: '',
    inventory: [],
    npcRelations: [],
    pcRelations: [],
    revealedInfo: [],
  })
}

export function normalizeRelation(row) {
  const next = fill(row, {
    fromId: '',
    toId: '',
    type: 'trust',
    customType: '',
    description: '',
    closeness: 0,
    visibility: 'gm',
  })
  next.closeness = Math.max(-5, Math.min(5, Number(next.closeness) || 0))
  if (!VISIBILITY.some(([value]) => value === next.visibility)) next.visibility = 'gm'
  return next
}

export function normalizeNote(row) {
  return fill(row, {
    title: '',
    text: '',
    tags: [],
    locationIds: [],
    characterIds: [],
    clueIds: [],
  })
}

export function normalizeSession(row) {
  return fill(row, {
    number: 1,
    date: '',
    title: '',
    description: '',
    notes: '',
    events: [],
    decisions: [],
    foundClueIds: [],
  })
}

export function normalizeProgress(row) {
  return fill(row, { id: 'main', beats: [] })
}

export function normalizeCache(cache) {
  return {
    meta: cache.meta || null,
    layout: cache.layout && typeof cache.layout === 'object' ? cache.layout : { nodes: {} },
    locations: (cache.locations || []).map(normalizeLocation),
    characters: (cache.characters || []).map(normalizeCharacter),
    clues: (cache.clues || []).map(normalizeClue),
    players: (cache.players || []).map(normalizePlayer),
    relations: (cache.relations || []).map(normalizeRelation),
    notes: (cache.notes || []).map(normalizeNote),
    sessions: (cache.sessions || []).map(normalizeSession),
    progress: normalizeProgress(cache.progress),
  }
}

export function personName(cache, id) {
  const character = cache.characters.find((item) => item.id === id)
  if (character) return character.name || 'Персонаж'
  const player = cache.players.find((item) => item.id === id)
  if (player) return playerTitle(player)
  return 'Неизвестно'
}

export function characterEndpoints(cache) {
  return byName(cache.characters).map((item) => ({
    id: item.id,
    label: item.name || 'Персонаж',
    group: 'Персонажи',
  }))
}

export function endpoints(cache) {
  return [
    ...characterEndpoints(cache),
    ...byName(cache.players, 'characterName').map((item) => ({ id: item.id, label: playerTitle(item), group: 'Игроки' })),
  ]
}
