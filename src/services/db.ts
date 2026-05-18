/**
 * Wrappers delgados sobre Firebase Realtime Database.
 * Equivalentes a fbAdd / fbSet / fbUpdate / fbRemove del monolito original,
 * pero sin la dependencia al DOM (setSyncStatus se maneja desde el store).
 */
import { ref, set, push, update, remove } from 'firebase/database'
import { db } from './firebase'

/** Elimina las claves con valor `undefined` (Firebase las rechaza). */
function clean<T extends object>(obj: T): T {
  Object.keys(obj).forEach(k => {
    if ((obj as Record<string, unknown>)[k] === undefined)
      (obj as Record<string, unknown>)[k] = null
  })
  return obj
}

export async function fbAdd(path: string, data: object): Promise<string> {
  const r = await push(ref(db, path), clean(data))
  return r.key!
}

export async function fbSet(path: string, data: object | string | boolean | number | null): Promise<void> {
  const payload = typeof data === 'object' && data !== null ? clean(data) : data
  await set(ref(db, path), payload)
}

export async function fbUpdate(path: string, data: object): Promise<void> {
  await update(ref(db, path), clean(data))
}

export async function fbRemove(path: string): Promise<void> {
  await remove(ref(db, path))
}
