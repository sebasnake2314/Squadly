/**
 * Wrappers delgados sobre Firebase Realtime Database.
 * Equivalentes a fbAdd / fbSet / fbUpdate / fbRemove del monolito original,
 * pero sin la dependencia al DOM (setSyncStatus se maneja desde el store).
 */
import { ref, push, update } from 'firebase/database'
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

export async function fbUpdate(path: string, data: object): Promise<void> {
  await update(ref(db, path), clean(data))
}
