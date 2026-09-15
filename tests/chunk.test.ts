import { describe, expect, it } from 'vitest'
import { chunk } from '../app/utils/chunk'

describe('chunk', () => {
  it('splits an array into rows of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]])
  })

  it('returns an empty list for an empty array', () => {
    expect(chunk([], 4)).toEqual([])
  })

  it('treats a size below 1 as 1 so it never loops forever', () => {
    expect(chunk(['a', 'b'], 0)).toEqual([['a'], ['b']])
  })
})
