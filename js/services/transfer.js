import { createCampaign, deleteCampaign, dumpCampaign, openCampaign } from '../db/campaign.js'
import { getCampaignRecord } from '../db/registry.js'
import { FORMAT_VERSION } from '../db/schema.js'
import {
  normalizeCharacter,
  normalizeClue,
  normalizeLocation,
  normalizeNote,
  normalizePlayer,
  normalizeProgress,
  normalizeRelation,
  normalizeSession,
} from '../domain.js'

const REQUIRED = ['locations', 'characters', 'clues', 'players', 'relations', 'notes', 'sessions']
const IMAGE_ID = /^[A-Za-z0-9_-]{1,80}$/

function zipLib() {
  const Ctor = globalThis.JSZip
  if (!Ctor) throw new Error('Библиотека архивов не загрузилась. Обновите страницу.')
  return Ctor
}

export async function exportCampaignToBlob(id) {
  const dump = await dumpCampaign(id)
  const zip = new (zipLib())()
  const manifest = {
    app: 'storykeeper',
    formatVersion: FORMAT_VERSION,
    schemaVersion: dump.meta?.schemaVersion || 2,
    exportedAt: new Date().toISOString(),
    name: dump.meta?.name || '',
  }
  const data = {
    meta: dump.meta,
    layout: dump.layout,
    locations: dump.locations,
    characters: dump.characters,
    clues: dump.clues,
    players: dump.players,
    relations: dump.relations,
    notes: dump.notes,
    sessions: dump.sessions,
    progress: dump.progress,
    images: (dump.images || []).map((image) => ({
      id: image.id,
      name: image.name || '',
      mime: image.mime || 'application/octet-stream',
      createdAt: image.createdAt || null,
    })),
  }
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  zip.file('data.json', JSON.stringify(data))
  for (const image of dump.images || []) {
    zip.file(`images/${image.id}`, image.data)
  }
  const buffer = await zip.generateAsync({ type: 'arraybuffer' })
  return new Blob([buffer], { type: 'application/zip' })
}

export async function importCampaignFromBlob(input) {
  let zip
  try {
    const source = typeof Blob !== 'undefined' && input instanceof Blob ? await input.arrayBuffer() : input
    zip = await zipLib().loadAsync(source)
  } catch {
    throw new Error('Не удалось прочитать архив. Нужен ZIP, экспортированный из StoryKeeper.')
  }
  const manifestFile = zip.file('manifest.json')
  const dataFile = zip.file('data.json')
  if (!manifestFile || !dataFile) throw new Error('В архиве нет manifest.json или data.json.')
  let manifest
  let data
  try {
    manifest = JSON.parse(await manifestFile.async('string'))
    data = JSON.parse(await dataFile.async('string'))
  } catch {
    throw new Error('Архив повреждён: файлы описания не читаются.')
  }
  assertManifest(manifest)
  const dump = await buildDump(zip, migrateFormat(data, manifest.formatVersion))
  const created = await createCampaign({
    name: dump.meta?.name || manifest.name || 'Импортированная игра',
    description: dump.meta?.description || '',
    status: dump.meta?.status || 'draft',
  })
  const db = await openCampaign(created.id)
  try {
    await db.importDump({
      ...dump,
      meta: {
        ...(dump.meta || {}),
        id: created.id,
        name: created.name,
        description: dump.meta?.description || '',
        status: dump.meta?.status || 'draft',
      },
    })
    await db.syncRegistryCover()
    return getCampaignRecord(created.id)
  } catch (error) {
    if (db.isOpen()) db.close()
    await deleteCampaign(created.id)
    if (error instanceof Error && error.message) throw error
    throw new Error('Не удалось восстановить игру из архива.')
  } finally {
    if (db.isOpen()) db.close()
  }
}

function assertManifest(manifest) {
  if (!manifest || manifest.app !== 'storykeeper') throw new Error('Это не архив StoryKeeper.')
  if (typeof manifest.formatVersion !== 'number') throw new Error('В архиве нет версии формата.')
  if (manifest.formatVersion > FORMAT_VERSION) {
    throw new Error('Архив создан в более новой версии StoryKeeper. Обновите приложение перед импортом.')
  }
  if (manifest.formatVersion < 1) throw new Error('Архив повреждён или несовместим.')
}

const GAME_STATUS = new Set(['draft', 'active', 'paused', 'completed'])

export function migrateFormat(data, version) {
  if (version !== 1 || !data || typeof data !== 'object') return data
  const meta = data.meta && typeof data.meta === 'object' ? { ...data.meta } : null
  if (meta && !GAME_STATUS.has(meta.status)) meta.status = 'draft'
  return {
    ...data,
    meta,
    locations: (data.locations || []).map(normalizeLocation),
    characters: (data.characters || []).map(normalizeCharacter),
    clues: (data.clues || []).map(normalizeClue),
    players: (data.players || []).map(normalizePlayer),
    relations: (data.relations || []).map(normalizeRelation),
    notes: (data.notes || []).map(normalizeNote),
    sessions: (data.sessions || []).map(normalizeSession),
    progress: data.progress ? normalizeProgress(data.progress) : { id: 'main', beats: [] },
  }
}

async function buildDump(zip, data) {
  if (!data || typeof data !== 'object') throw new Error('В архиве неполная структура данных.')
  for (const key of REQUIRED) {
    if (!Array.isArray(data[key])) throw new Error('В архиве неполная структура данных.')
  }
  for (const [key, label] of [
    ['locations', 'локация'],
    ['characters', 'персонаж'],
    ['clues', 'улика'],
    ['players', 'игрок'],
    ['relations', 'связь'],
    ['notes', 'заметка'],
    ['sessions', 'сессия'],
  ]) {
    requireIds(data[key], label)
  }
  if (data.images != null && !Array.isArray(data.images)) {
    throw new Error('В архиве неполная структура данных.')
  }
  const images = []
  for (const image of data.images || []) {
    if (!image || !IMAGE_ID.test(image.id || '')) {
      throw new Error('В архиве указано изображение с недопустимым именем.')
    }
    const file = zip.file(`images/${image.id}`)
    if (!file) throw new Error(`В архиве нет изображения ${image.id}.`)
    images.push({
      id: image.id,
      name: typeof image.name === 'string' ? image.name : '',
      mime: typeof image.mime === 'string' ? image.mime : 'application/octet-stream',
      data: await file.async('arraybuffer'),
      createdAt: image.createdAt || new Date().toISOString(),
    })
  }
  return { ...data, images }
}

function requireIds(list, label) {
  for (const row of list) {
    if (!row || typeof row.id !== 'string' || !row.id.trim()) {
      throw new Error(`В архиве повреждена карточка (${label}).`)
    }
  }
}

export function fileSlug(name) {
  const slug = String(name || 'igra')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
  return `storykeeper-${slug || 'igra'}.zip`
}
