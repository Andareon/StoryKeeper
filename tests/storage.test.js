import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import JSZip from 'jszip'
import { createCampaign, deleteCampaign, duplicateCampaign, openCampaign } from '../js/db/campaign.js'
import { deleteDB, getAll, openDB } from '../js/db/idb.js'
import { getCampaignRecord } from '../js/db/registry.js'
import { campaignDbName, SCHEMA_VERSION, upgradeDatabase } from '../js/db/schema.js'
import { createSaver } from '../js/services/autosave.js'
import { searchCampaign } from '../js/services/search.js'
import { createSampleCampaign } from '../js/services/seed.js'
import { exportCampaignToBlob, importCampaignFromBlob, migrateFormat } from '../js/services/transfer.js'

globalThis.JSZip = JSZip

describe('хранилище StoryKeeper', { concurrency: 1 }, () => {
  test('две игры не видят записи друг друга', async () => {
    const first = await createCampaign({ name: 'Первая', description: 'а' })
    const second = await createCampaign({ name: 'Вторая', description: 'б' })
    const dbA = await openCampaign(first.id)
    const dbB = await openCampaign(second.id)
    try {
      await dbA.put('locations', { id: 'same', name: 'Зал А' })
      await dbB.put('locations', { id: 'same', name: 'Зал Б' })
      const rowsA = await dbA.all('locations')
      const rowsB = await dbB.all('locations')
      assert.equal(rowsA.length, 1)
      assert.equal(rowsB.length, 1)
      assert.equal(rowsA[0].name, 'Зал А')
      assert.equal(rowsB[0].name, 'Зал Б')
      const listed = await getCampaignRecord(first.id)
      assert.equal(listed.counts.locations, 1)
    } finally {
      dbA.close()
      dbB.close()
      await deleteCampaign(first.id)
      await deleteCampaign(second.id)
    }
  })

  test('изображение хранится байтами и переживает экспорт', async () => {
    const created = await createCampaign({ name: 'Архив' })
    const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10])
    const db = await openCampaign(created.id)
    let importedId = null
    try {
      const image = await db.putImage({ data: bytes.buffer, mime: 'image/png', name: 'cover.png' })
      await db.put('locations', { id: 'hall', name: 'Холл' })
      const meta = await db.getMeta()
      await db.putMeta({ ...meta, coverImageId: image.id })
      await db.syncRegistryCover()
      const blob = await exportCampaignToBlob(created.id)
      const restored = await importCampaignFromBlob(blob)
      importedId = restored.id
      const copy = await openCampaign(restored.id)
      try {
        await copy.loadAll()
        assert.equal(copy.cache.locations[0].name, 'Холл')
        const images = await copy.all('images')
        assert.equal(images.length, 1)
        assert.deepEqual(new Uint8Array(images[0].data), bytes)
        assert.equal(restored.coverMime, 'image/png')
        assert.ok(restored.coverData.byteLength === bytes.byteLength)
      } finally {
        copy.close()
      }
    } finally {
      db.close()
      await deleteCampaign(created.id)
      if (importedId) await deleteCampaign(importedId)
    }
  })

  test('импорт отвергает чужой и слишком новый архив', async () => {
    const foreign = new JSZip()
    foreign.file('manifest.json', JSON.stringify({ app: 'other', formatVersion: 1 }))
    foreign.file('data.json', '{}')
    await assert.rejects(
      async () => importCampaignFromBlob(await foreign.generateAsync({ type: 'arraybuffer' })),
      /StoryKeeper/,
    )
    const newer = new JSZip()
    newer.file('manifest.json', JSON.stringify({ app: 'storykeeper', formatVersion: 99 }))
    newer.file('data.json', '{}')
    await assert.rejects(
      async () => importCampaignFromBlob(await newer.generateAsync({ type: 'arraybuffer' })),
      /новой версии/,
    )
  })

  test('миграция формата проставляет статус улики', () => {
    const data = migrateFormat({
      clues: [{ id: 'c1', name: 'Ключ' }, { id: 'c2', status: 'studied' }, { id: 'c3', status: 'unavailable' }],
      relations: [{ id: 'r1', visibility: 'hidden' }, { id: 'r2', visibility: 'public' }],
    }, 1)
    assert.equal(data.clues[0].status, 'not_found')
    assert.equal(data.clues[1].status, 'found')
    assert.equal(data.clues[2].status, 'not_found')
    assert.equal(data.relations[0].visibility, 'gm')
    assert.equal(data.relations[1].visibility, 'public')
    assert.ok(Array.isArray(data.clues[0].linkedClueIds))
    assert.equal(data.meta, null)
  })

  test('миграция базы сохраняет данные и добавляет индекс', async () => {
    const name = campaignDbName(`mig-${crypto.randomUUID()}`)
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('locations', { keyPath: 'id' })
        db.createObjectStore('clues', { keyPath: 'id' })
        db.createObjectStore('sessions', { keyPath: 'id' })
      }
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('locations', 'readwrite')
        tx.objectStore('locations').put({ id: 'hall', name: 'Зал' })
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
      request.onerror = () => reject(request.error)
    })
    const db = await openDB(name, SCHEMA_VERSION, upgradeDatabase)
    try {
      const rows = await getAll(db, 'locations')
      assert.equal(rows[0].name, 'Зал')
      assert.equal(db.transaction('clues').objectStore('clues').indexNames.contains('by_status'), true)
      assert.equal(db.objectStoreNames.contains('notes'), true)
    } finally {
      db.close()
      await deleteDB(name)
    }
  })

  test('в одну сторону сохраняется только одна связь', async () => {
    const created = await createCampaign({ name: 'Направление' })
    const db = await openCampaign(created.id)
    try {
      await db.loadAll()
      await db.put('relations', { id: 'one', fromId: 'a', toId: 'b', type: 'trust', description: 'первая' }, { touch: false })
      await db.put('relations', { id: 'back', fromId: 'b', toId: 'a', type: 'enmity', description: 'обратно' }, { touch: false })
      await assert.rejects(
        () => db.put('relations', { id: 'two', fromId: 'a', toId: 'b', type: 'love' }, { touch: false }),
        /сторону/,
      )
      assert.equal(db.cache.relations.length, 2)
      await db.putRaw('relations', { id: 'extra', fromId: 'a', toId: 'b', type: 'love', description: 'лишнее', closeness: 0, visibility: 'gm' })
      await db.loadAll()
      const forward = db.cache.relations.filter((rel) => rel.fromId === 'a' && rel.toId === 'b')
      assert.equal(forward.length, 1)
      assert.match(forward[0].description, /первая/)
      assert.match(forward[0].description, /лишнее/)
      const stored = (await db.all('relations')).filter((rel) => rel.fromId === 'a' && rel.toId === 'b')
      assert.equal(stored.length, 1)
      assert.equal(db.cache.relations.some((rel) => rel.fromId === 'b' && rel.toId === 'a'), true)
    } finally {
      db.close()
      await deleteCampaign(created.id)
    }
  })

  test('удаление персонажа снимает связь и саму игру', async () => {
    const created = await createCampaign({ name: 'Удаление' })
    const db = await openCampaign(created.id)
    try {
      await db.loadAll()
      await db.put('characters', { id: 'a', name: 'Агата' }, { touch: false })
      await db.put('characters', { id: 'b', name: 'Леон' }, { touch: false })
      await db.put('relations', { id: 'r', fromId: 'a', toId: 'b', type: 'enmity', description: 'спор', closeness: -2, visibility: 'gm' }, { touch: false })
      await db.loadAll()
      await db.deleteEntity('characters', 'a')
      assert.equal(db.cache.characters.some((row) => row.id === 'a'), false)
      assert.equal(db.cache.relations.length, 0)
    } finally {
      db.close()
    }
    await deleteCampaign(created.id)
    assert.equal(await getCampaignRecord(created.id), null)
  })

  test('пример заполняет сюжет и копируется', async () => {
    const record = await createSampleCampaign()
    const db = await openCampaign(record.id)
    let copyId = null
    try {
      await db.loadAll()
      const agatha = db.cache.characters.find((row) => row.name === 'Агата Вереск')
      assert.ok(agatha.dialogues.length >= 5)
      assert.ok(db.cache.locations.length >= 5)
      assert.ok(db.cache.clues.length >= 7)
      assert.equal(db.cache.players.length, 2)
      assert.ok(db.cache.relations.length >= 5)
      assert.equal(db.cache.sessions[0].foundClueIds.length, 2)
      const images = await db.all('images')
      assert.ok(images.length >= 3)
      assert.ok(images[0].data.byteLength > 50)
      const found = searchCampaign(db.cache, 'ночной поезд')
      assert.ok(found.some((item) => item.section === 'clues'))
      const copy = await duplicateCampaign(record.id)
      copyId = copy.id
      assert.match(copy.name, /копия/)
      assert.ok(copy.counts.clues >= 7)
    } finally {
      db.close()
      await deleteCampaign(record.id)
      if (copyId) await deleteCampaign(copyId)
    }
  })

  test('автосохранение склеивает быстрые правки и пишет сразу по команде', async () => {
    const seen = []
    const saver = createSaver({
      delay: 40,
      save: async (draft) => { seen.push(draft.value) },
      onStatus() {},
    })
    saver.schedule({ value: 1 })
    saver.schedule({ value: 2 })
    await new Promise((resolve) => setTimeout(resolve, 80))
    assert.deepEqual(seen, [2])
    await saver.immediate({ value: 3 })
    assert.deepEqual(seen, [2, 3])
    const failing = createSaver({
      delay: 20,
      save: async () => { throw new Error('диск') },
      onStatus() {},
    })
    await failing.immediate({ value: 'x' })
    await failing.flush()
    failing.dispose()
    saver.dispose()
  })
})
