import { describe, it, expect } from 'vitest'
import { extractHashtags, mergeTags, normalizeTag, normalizeTags, parseTagsField } from '../shared/utils/hashtags'

describe('hashtags 유틸', () => {
  it('normalizeTag은 앞의 #·공백·기호를 걷어내고 글자·숫자·밑줄만 남긴다', () => {
    expect(normalizeTag('#독서')).toBe('독서')
    expect(normalizeTag('  # 점심 독서! ')).toBe('점심독서')
    expect(normalizeTag('book_club2')).toBe('book_club2')
    expect(normalizeTag('###')).toBe('')
    expect(normalizeTag('a'.repeat(40))).toHaveLength(20)
  })

  it('normalizeTags는 빈 값·중복(대소문자 무시)을 지우고 최대 10개만 남긴다', () => {
    expect(normalizeTags(['#독서', '독서', 'Book', 'book', '', '  '])).toEqual(['독서', 'Book'])
    const many = Array.from({ length: 15 }, (_, i) => `t${i}`)
    expect(normalizeTags(many)).toHaveLength(10)
  })

  it('extractHashtags는 캡션 안의 #태그를 순서대로 뽑는다', () => {
    expect(extractHashtags('오늘 #점심독서 15분 #함께자라기 #book_club 끝!')).toEqual([
      '점심독서', '함께자라기', 'book_club',
    ])
    expect(extractHashtags(null)).toEqual([])
    expect(extractHashtags('태그 없음')).toEqual([])
  })

  it('mergeTags는 명시 태그 뒤에 캡션 태그를 붙이고 중복을 지운다', () => {
    expect(mergeTags(['독서', '옥상'], '#옥상 에서 #점심독서')).toEqual(['독서', '옥상', '점심독서'])
  })

  it('parseTagsField는 JSON 배열·쉼표 구분 문자열 둘 다 받고 이상한 값은 빈 배열', () => {
    expect(parseTagsField('["독서","#옥상"]')).toEqual(['독서', '옥상'])
    expect(parseTagsField('독서, #옥상 ,,')).toEqual(['독서', '옥상'])
    expect(parseTagsField(undefined)).toEqual([])
    expect(parseTagsField('{"a":1}')).toEqual([])
  })
})
