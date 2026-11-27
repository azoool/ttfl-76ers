import { describe, expect, it } from 'vitest'
import { createDeduper, createLimiter } from '../src/lib/limit'

const tick = () => new Promise((r) => setTimeout(r, 0))

/** Tâche qu'on termine à la main, pour observer ce qui tourne. */
function manual() {
  let done!: (v: string) => void
  let fail!: (e: Error) => void
  const promise = new Promise<string>((res, rej) => {
    done = res
    fail = rej
  })
  return { promise, done, fail }
}

describe('createLimiter', () => {
  it('ne lance pas plus de tâches à la fois que permis, et enchaîne les suivantes', async () => {
    const limit = createLimiter(2)
    const tasks = [manual(), manual(), manual()]
    const started: number[] = []
    const results = tasks.map((t, i) =>
      limit(() => {
        started.push(i)
        return t.promise
      }),
    )
    expect(started).toEqual([0, 1])
    tasks[0].done('a')
    await tick()
    expect(started).toEqual([0, 1, 2])
    tasks[1].done('b')
    tasks[2].done('c')
    expect(await Promise.all(results)).toEqual(['a', 'b', 'c'])
  })

  it('libère sa place quand une tâche échoue', async () => {
    const limit = createLimiter(1)
    const first = manual()
    const failing = limit(() => first.promise)
    const next = limit(async () => 'suivante')
    first.fail(new Error('raté'))
    await expect(failing).rejects.toThrow('raté')
    expect(await next).toBe('suivante')
  })
})

describe('createDeduper', () => {
  it('partage une demande en cours, puis en refait une après sa fin', async () => {
    const dedupe = createDeduper<string>()
    let calls = 0
    const first = manual()
    const load = () => {
      calls++
      return first.promise
    }
    const a = dedupe('k', load)
    const b = dedupe('k', load)
    expect(calls).toBe(1)
    first.done('ok')
    expect(await Promise.all([a, b])).toEqual(['ok', 'ok'])
    await tick()
    await dedupe('k', load)
    expect(calls).toBe(2)
  })
})
