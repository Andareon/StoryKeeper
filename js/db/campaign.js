import { purgeReferences } from './cleanup.js'
import { countStore, deleteDB, getAll, getOne, openDB, putOne, removeOne } from './idb.js'
import {
  deleteCampaignRecord,
  getCampaignRecord,
  putCampaignRecord,
  updateRegistry,
} from './registry.js'
import { campaignDbName, ENTITY_STORES, SCHEMA_VERSION, upgradeDatabase } from './schema.js'
import { collapseDirections, normalizeCache, relationInDirection } from '../domain.js'

const openConnections = new Map()

export function isCampaignOpen(id) {
  return Boolean(openConnections.get(id)?.isOpen())
}

export async function openCampaign(id) {
  const existing = openConnections.get(id)
  if (existing?.isOpen()) return existing
  const raw = await openDB(campaignDbName(id), SCHEMA_VERSION, upgradeDatabase)
  raw.onversionchange = () => {
    raw.close()
    const current = openConnections.get(id)
    if (current) current._open = false
    openConnections.delete(id)
  }
  const api = new CampaignDB(id, raw)
  openConnections.set(id, api)
  return api
}

export class CampaignDB {
  constructor(id, db) {
    this.id = id
    this.db = db
    this.cache = null
    this._open = true
  }

  isOpen() {
    return this._open
  }

  close() {
    if (!this._open) return
    this._open = false
    this.db.close()
    openConnections.delete(this.id)
  }

  all(store) {
    return getAll(this.db, store)
  }

  get(store, key) {
    return getOne(this.db, store, key)
  }

  async count(store) {
    return countStore(this.db, store)
  }

  async getMeta() {
    const row = await this.get('meta', 'settings')
    return row?.value || null
  }

  async getLayout() {
    const row = await this.get('meta', 'layout')
    return row?.value || { nodes: {} }
  }

  async loadAll() {
    const [metaRow, layoutRow, locations, characters, clues, players, relations, notes, sessions, progress] = await Promise.all([
      this.get('meta', 'settings'),
      this.get('meta', 'layout'),
      this.all('locations'),
      this.all('characters'),
      this.all('clues'),
      this.all('players'),
      this.all('relations'),
      this.all('notes'),
      this.all('sessions'),
      this.get('progress', 'main'),
    ])
    this.cache = normalizeCache({
      meta: metaRow?.value || null,
      layout: layoutRow?.value || { nodes: {} },
      locations,
      characters,
      clues,
      players,
      relations,
      notes,
      sessions,
      progress: progress || { id: 'main', beats: [] },
    })
    const folded = collapseDirections(this.cache.relations)
    if (folded.removed.length || folded.rewritten.length) {
      this.cache.relations = folded.kept
      for (const id of folded.removed) await removeOne(this.db, 'relations', id)
      for (const rel of folded.rewritten) await putOne(this.db, 'relations', rel)
    }
    return this.cache
  }

  remember(store, record) {
    if (!this.cache) return
    if (store === 'progress') {
      this.cache.progress = record
      return
    }
    const list = this.cache[store]
    if (!Array.isArray(list)) return
    const index = list.findIndex((row) => row.id === record.id)
    if (index >= 0) list[index] = record
    else list.push(record)
  }

  async putRaw(store, record) {
    await putOne(this.db, store, record)
    return record
  }

  async put(store, record, { touch = true } = {}) {
    const now = new Date().toISOString()
    const next = { ...record }
    if (!next.id) next.id = crypto.randomUUID()
    if (store === 'relations') {
      if (!this.cache) await this.loadAll()
      if (relationInDirection(this.cache?.relations, next.fromId, next.toId, next.id)) {
        throw new Error('В эту сторону связь уже есть.')
      }
    }
    if (!next.createdAt) next.createdAt = now
    next.updatedAt = now
    await this.putRaw(store, next)
    this.remember(store, next)
    if (touch) await this.touch()
    return next
  }

  async remove(store, id, { touch = true } = {}) {
    await removeOne(this.db, store, id)
    if (this.cache?.[store]) {
      this.cache[store] = this.cache[store].filter((row) => row.id !== id)
    }
    if (touch) await this.touch()
  }

  async putMeta(value) {
    const next = {
      ...value,
      id: this.id,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    }
    await this.putRaw('meta', { key: 'settings', value: next })
    if (this.cache) this.cache.meta = next
    return next
  }

  async saveLayout(layout) {
    const next = layout || { nodes: {} }
    await this.putRaw('meta', { key: 'layout', value: next })
    if (this.cache) this.cache.layout = next
    return next
  }

  async saveProgress(progress) {
    const next = { ...progress, id: 'main', updatedAt: new Date().toISOString() }
    await this.putRaw('progress', next)
    if (this.cache) this.cache.progress = next
    return next
  }

  async putImage({ data, mime, name }) {
    const record = {
      id: crypto.randomUUID(),
      data,
      mime: mime || 'application/octet-stream',
      name: name || '',
      createdAt: new Date().toISOString(),
    }
    await this.putRaw('images', record)
    return record
  }

  getImage(id) {
    if (!id) return Promise.resolve(null)
    return this.get('images', id)
  }

  async deleteImage(id) {
    if (!id) return
    await removeOne(this.db, 'images', id)
  }

  async touch(extra = {}) {
    const meta = this.cache?.meta || await this.getMeta()
    if (meta) {
      meta.updatedAt = new Date().toISOString()
      if (this.cache) this.cache.meta = meta
      await this.putRaw('meta', { key: 'settings', value: meta })
    }
    const [locations, characters, clues, players, sessions] = await Promise.all([
      this.count('locations'),
      this.count('characters'),
      this.count('clues'),
      this.count('players'),
      this.count('sessions'),
    ])
    await updateRegistry(this.id, {
      name: meta?.name?.trim() || 'Без названия',
      description: meta?.description || '',
      status: meta?.status || 'draft',
      updatedAt: meta?.updatedAt || new Date().toISOString(),
      counts: { locations, characters, clues, players, sessions },
      ...extra,
    })
  }

  async setCover(file) {
    const meta = { ...(this.cache?.meta || await this.getMeta() || {}) }
    if (meta.coverImageId) await this.deleteImage(meta.coverImageId)
    let coverImageId = null
    let coverData = null
    let coverMime = ''
    if (file) {
      const data = file.data || await file.arrayBuffer()
      const image = await this.putImage({
        data,
        mime: file.type || file.mime || 'application/octet-stream',
        name: file.name || 'cover',
      })
      coverImageId = image.id
      coverData = data
      coverMime = image.mime
    }
    meta.coverImageId = coverImageId
    await this.putMeta(meta)
    await this.touch({ coverData, coverMime })
    return this.cache?.meta || meta
  }

  async syncRegistryCover() {
    const meta = this.cache?.meta || await this.getMeta()
    let coverData = null
    let coverMime = ''
    if (meta?.coverImageId) {
      const image = await this.getImage(meta.coverImageId)
      if (image?.data) {
        coverData = image.data
        coverMime = image.mime || ''
      }
    }
    await this.touch({ coverData, coverMime })
  }

  async exportDump() {
    return {
      meta: await this.getMeta(),
      layout: await this.getLayout(),
      locations: await this.all('locations'),
      characters: await this.all('characters'),
      clues: await this.all('clues'),
      players: await this.all('players'),
      relations: await this.all('relations'),
      notes: await this.all('notes'),
      sessions: await this.all('sessions'),
      progress: (await this.get('progress', 'main')) || { id: 'main', beats: [] },
      images: await this.all('images'),
    }
  }

  async importDump(dump) {
    if (dump.meta) await this.putMeta({ ...dump.meta, id: this.id })
    if (dump.layout) await this.saveLayout(dump.layout)
    for (const store of ENTITY_STORES) {
      for (const row of dump[store] || []) await this.putRaw(store, row)
    }
    if (dump.progress) await this.putRaw('progress', { ...dump.progress, id: 'main' })
    for (const image of dump.images || []) await this.putRaw('images', image)
    await this.loadAll()
  }

  async deleteEntity(store, id) {
    const record = this.cache?.[store]?.find((row) => row.id === id) || await this.get(store, id)
    await purgeReferences(this, id)
    await this.remove(store, id, { touch: false })
    const imageIds = []
    if (record?.portraitId) imageIds.push(record.portraitId)
    if (record?.imageId) imageIds.push(record.imageId)
    if (Array.isArray(record?.imageIds)) imageIds.push(...record.imageIds)
    for (const imageId of imageIds) await this.deleteImage(imageId)
    await this.touch()
  }
}

export async function createCampaign({ name, description = '', status = 'draft', coverFile = null } = {}) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await putCampaignRecord({
    id,
    name: name?.trim() || 'Без названия',
    description: description || '',
    status: status || 'draft',
    createdAt: now,
    updatedAt: now,
    coverData: null,
    coverMime: '',
    counts: { locations: 0, characters: 0, clues: 0, players: 0, sessions: 0 },
  })
  const db = await openCampaign(id)
  try {
    await db.putMeta({
      id,
      name: name?.trim() || 'Без названия',
      description: description || '',
      status: status || 'draft',
      coverImageId: null,
      createdAt: now,
    })
    await db.saveProgress({ id: 'main', beats: [] })
    if (coverFile) await db.setCover(coverFile)
    else await db.touch()
  } finally {
    db.close()
  }
  return getCampaignRecord(id)
}

export async function deleteCampaign(id) {
  const existing = openConnections.get(id)
  if (existing) existing.close()
  await deleteDB(campaignDbName(id))
  await deleteCampaignRecord(id)
}

export async function dumpCampaign(id) {
  const owned = !isCampaignOpen(id)
  const db = await openCampaign(id)
  try {
    return await db.exportDump()
  } finally {
    if (owned) db.close()
  }
}

export async function duplicateCampaign(id) {
  const dump = await dumpCampaign(id)
  const copyName = `${dump.meta?.name || 'Игра'} (копия)`
  const created = await createCampaign({
    name: copyName,
    description: dump.meta?.description || '',
    status: dump.meta?.status || 'draft',
  })
  const db = await openCampaign(created.id)
  try {
    await db.importDump({
      ...dump,
      meta: { ...(dump.meta || {}), id: created.id, name: copyName },
    })
    await db.syncRegistryCover()
  } finally {
    db.close()
  }
  return getCampaignRecord(created.id)
}
