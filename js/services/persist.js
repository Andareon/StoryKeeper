import { syncChildLinks, syncSymmetric } from '../db/links.js'

export async function saveLocation(db, draft) {
  const saved = await db.put('locations', draft, { touch: false })
  await syncChildLinks(db, {
    childStore: 'characters',
    childField: 'locationIds',
    ownerId: saved.id,
    nextIds: saved.characterIds,
  })
  await syncSymmetric(db, 'locations', 'linkedLocationIds', saved.id, saved.linkedLocationIds)
  await db.touch()
  return saved
}

export async function saveCharacter(db, draft) {
  const saved = await db.put('characters', draft, { touch: false })
  await syncChildLinks(db, {
    childStore: 'locations',
    childField: 'characterIds',
    ownerId: saved.id,
    nextIds: saved.locationIds,
  })
  await syncChildLinks(db, {
    childStore: 'clues',
    childField: 'characterIds',
    ownerId: saved.id,
    nextIds: saved.clueIds,
  })
  await db.touch()
  return saved
}

export async function saveClue(db, draft) {
  const saved = await db.put('clues', draft, { touch: false })
  await syncSymmetric(db, 'clues', 'linkedClueIds', saved.id, saved.linkedClueIds)
  await syncChildLinks(db, {
    childStore: 'characters',
    childField: 'clueIds',
    ownerId: saved.id,
    nextIds: saved.characterIds,
  })
  await db.touch()
  return saved
}

export async function savePlain(db, store, draft) {
  return db.put(store, draft)
}

export async function saveOrder(db, store, ordered) {
  for (let index = 0; index < ordered.length; index += 1) {
    await db.put(store, { ...ordered[index], order: index }, { touch: false })
  }
  if (ordered.length) await db.touch()
}
