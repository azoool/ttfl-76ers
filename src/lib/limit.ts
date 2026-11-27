/** File d'attente : pas plus de `max` tâches en cours à la fois, les suivantes attendent leur tour. */
export function createLimiter(max: number) {
  let active = 0
  const waiting: Array<() => void> = []
  return <T>(task: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        active++
        task()
          .then(resolve, reject)
          .finally(() => {
            active--
            waiting.shift()?.()
          })
      }
      if (active < max) start()
      else waiting.push(start)
    })
}

/** Deux demandes identiques en même temps partagent la même tâche ; une fois finie, elle est oubliée. */
export function createDeduper<T>() {
  const pending = new Map<string, Promise<T>>()
  return (key: string, load: () => Promise<T>): Promise<T> => {
    let p = pending.get(key)
    if (!p) {
      p = load().finally(() => pending.delete(key))
      pending.set(key, p)
    }
    return p
  }
}
