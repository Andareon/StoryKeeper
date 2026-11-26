export const SCHEMA_VERSION = 2
export const FORMAT_VERSION = 1
export const REGISTRY_DB = 'storykeeper-registry'
export const DB_PREFIX = 'storykeeper-game-'

export const ENTITY_STORES = [
  'locations',
  'characters',
  'clues',
  'players',
  'relations',
  'notes',
  'sessions',
]

const ID_STORES = [...ENTITY_STORES, 'images', 'progress']

export function campaignDbName(id) {
  return `${DB_PREFIX}${id}`
}

export function upgradeDatabase(db, tx, oldVersion) {
  for (const name of ID_STORES) {
    if (!db.objectStoreNames.contains(name)) {
      db.createObjectStore(name, { keyPath: 'id' })
    }
  }
  if (!db.objectStoreNames.contains('meta')) {
    db.createObjectStore('meta', { keyPath: 'key' })
  }
  if (oldVersion < 2) {
    ensureIndex(db, tx, 'clues', 'by_status', 'status')
    ensureIndex(db, tx, 'sessions', 'by_date', 'date')
  }
}

function ensureIndex(db, tx, storeName, indexName, keyPath) {
  if (!db.objectStoreNames.contains(storeName)) return
  const store = tx.objectStore(storeName)
  if (!store.indexNames.contains(indexName)) {
    store.createIndex(indexName, keyPath, { unique: false })
  }
}

export function upgradeRegistry(db) {
  if (!db.objectStoreNames.contains('campaigns')) {
    db.createObjectStore('campaigns', { keyPath: 'id' })
  }
}
