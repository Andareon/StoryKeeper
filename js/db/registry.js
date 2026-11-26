import { deleteDB, getAll, getOne, openDB, putOne, removeOne } from './idb.js'
import { REGISTRY_DB, upgradeRegistry } from './schema.js'

async function registry() {
  return openDB(REGISTRY_DB, 1, upgradeRegistry)
}

export async function listCampaigns() {
  const db = await registry()
  try {
    const rows = await getAll(db, 'campaigns')
    return rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  } finally {
    db.close()
  }
}

export async function getCampaignRecord(id) {
  const db = await registry()
  try {
    return (await getOne(db, 'campaigns', id)) || null
  } finally {
    db.close()
  }
}

export async function putCampaignRecord(record) {
  const db = await registry()
  try {
    await putOne(db, 'campaigns', record)
  } finally {
    db.close()
  }
  return record
}

export async function updateRegistry(id, patch) {
  const current = await getCampaignRecord(id)
  if (!current) return null
  return putCampaignRecord({ ...current, ...patch })
}

export async function deleteCampaignRecord(id) {
  const db = await registry()
  try {
    await removeOne(db, 'campaigns', id)
  } finally {
    db.close()
  }
}

export async function deleteRegistry() {
  await deleteDB(REGISTRY_DB)
}
