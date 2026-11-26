function wrapStoreError(error) {
  if (error?.name === 'QuotaExceededError') {
    return new Error('Недостаточно места в хранилище браузера. Экспортируйте игру и удалите крупные изображения.')
  }
  return error || new Error('Ошибка записи')
}

export function openDB(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onupgradeneeded = (event) => {
      try {
        upgrade(request.result, request.transaction, event.oldVersion)
      } catch (error) {
        reject(error)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Не удалось открыть базу'))
    request.onblocked = () => {
      reject(new Error('База занята другой вкладкой. Закройте лишние вкладки StoryKeeper и повторите.'))
    }
  })
}

export function deleteDB(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error || new Error('Не удалось удалить базу'))
    request.onblocked = () => {
      reject(new Error('Не удалось удалить игру: база открыта в другой вкладке.'))
    }
  })
}

export function getAll(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error || new Error('Ошибка чтения'))
  })
}

export function getOne(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Ошибка чтения'))
  })
}

export function putOne(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    try {
      tx.objectStore(storeName).put(value)
    } catch (error) {
      reject(wrapStoreError(error))
      return
    }
    tx.oncomplete = () => resolve(value)
    tx.onerror = () => reject(wrapStoreError(tx.error))
    tx.onabort = () => reject(wrapStoreError(tx.error || new Error('Запись прервана')))
  })
}

export function removeOne(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(wrapStoreError(tx.error))
    tx.onabort = () => reject(wrapStoreError(tx.error || new Error('Удаление прервано')))
  })
}

export function countStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const request = tx.objectStore(storeName).count()
    request.onsuccess = () => resolve(request.result || 0)
    request.onerror = () => reject(request.error || new Error('Ошибка чтения'))
  })
}
