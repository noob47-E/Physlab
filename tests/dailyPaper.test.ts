import { describe, expect, it, beforeEach } from 'vitest'
import { loadDaily, saveDaily, generateDailyPaper, recordResult } from '../src/renderer/src/panels/dailyPaperLogic'
import { type TopicId } from '../src/renderer/src/math/problems'
import type { PQQuestion } from '../src/renderer/src/questions/pqjson'
import type { Item } from '../src/renderer/src/panels/Practice'

// Mock localStorage
const localStorageMock = (function () {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    clear: () => {
      store = {}
    },
    mockError: false
  }
})()
Object.defineProperty(global, 'localStorage', {
  value: new Proxy(localStorageMock, {
    get(target, prop, receiver) {
      if (prop === 'getItem' || prop === 'setItem') {
        if (target.mockError) throw new Error('Storage blocked')
      }
      return Reflect.get(target, prop, receiver)
    }
  })
})

const mockBankQuestions = [
  { id: 'bq1', tags: ['motion'] } as PQQuestion,
  { id: 'bq2', tags: ['forces'] } as PQQuestion,
  { id: 'bq3', tags: ['motion', 'forces'] } as PQQuestion
]

describe('Daily paper logic', () => {
  beforeEach(() => {
    localStorageMock.clear()
    localStorageMock.mockError = false
  })

  it('generates the same paper for the same date, different for another', () => {
    const paper1 = generateDailyPaper('2026-10-18', null, ['components'], mockBankQuestions)
    const paper2 = generateDailyPaper('2026-10-18', null, ['components'], mockBankQuestions)
    const paper3 = generateDailyPaper('2026-10-19', null, ['components'], mockBankQuestions)

    expect(paper1.length).toBe(10)

    // same paper (from cache)
    expect(paper1.map(p => p.kind === 'topic' ? p.problem.id : p.seed)).toEqual(paper2.map(p => p.kind === 'topic' ? p.problem.id : p.seed))

    // different paper next day
    expect(paper1.map(p => p.kind === 'topic' ? p.problem.id : p.seed)).not.toEqual(paper3.map(p => p.kind === 'topic' ? p.problem.id : p.seed))
  })

  it('uses only practiced topics or falls back to chosen', () => {
    const history = { topics: ['dot' as TopicId], tags: [] }
    const paper1 = generateDailyPaper('2026-10-22', history, ['components'], mockBankQuestions)

    const topics = paper1.filter(p => p.kind === 'topic').map(p => {
       if (p.kind === 'topic') return p.problem.topic
       return ''
    })
    expect(topics.every(t => t === 'dot')).toBe(true)

    const paper2 = generateDailyPaper('2026-10-23', null, ['add'], mockBankQuestions)
    const topics2 = paper2.filter(p => p.kind === 'topic').map(p => {
       if (p.kind === 'topic') return p.problem.topic
       return ''
    })
    expect(topics2.every(t => t === 'add')).toBe(true)
  })
  
  it('uses tags to pick bank questions', () => {
    const history = { topics: [], tags: ['forces'] }
    // There are 2 questions with 'forces' tag.
    const paper = generateDailyPaper('2026-10-24', history, ['components'], mockBankQuestions)
    const qs = paper.filter(p => p.kind === 'question').map(p => {
       if (p.kind === 'question') return p.question.id
       return ''
    })
    expect(qs.every(id => id === 'bq2' || id === 'bq3')).toBe(true)
    expect(qs.length).toBe(5)
  })

  it('saves and reads back history safely, recovers from broken', () => {
    const s = { topics: ['dot' as TopicId], tags: ['motion'], resultsByDate: {} }
    saveDaily(s)

    const back = loadDaily()
    expect(back).toEqual(s)

    localStorageMock.setItem('physlab.daily', '{ broken json')
    const broken = loadDaily()
    expect(broken).toBeNull()

    localStorageMock.mockError = true
    expect(loadDaily()).toBeNull()
    expect(() => saveDaily(s)).not.toThrow()
  })

  it('records result and adds topics/tags', () => {
    const emptyDaily = { topics: [], tags: [], resultsByDate: {} }
    const mockItemTopic = { kind: 'topic', problem: { topic: 'add' } } as Item
    const res1 = { id: 'test1', title: 't1', right: true, hints: 0, seconds: 10 }

    const d2 = recordResult(emptyDaily, '2026-10-18', mockItemTopic, res1)
    expect(d2.topics).toEqual(['add'])
    expect(d2.resultsByDate['2026-10-18'].length).toBe(1)

    const mockItemQ = { kind: 'question', question: { tags: ['motion'] } } as Item
    const res2 = { id: 'test2', title: 't2', right: false, hints: 1, seconds: 5 }
    const d3 = recordResult(d2, '2026-10-18', mockItemQ, res2)
    expect(d3.tags).toEqual(['motion'])
    expect(d3.resultsByDate['2026-10-18'].length).toBe(2)

    // date change does NOT clear topics and tags
    const d4 = recordResult(d3, '2026-10-19', mockItemTopic, res1)
    expect(d4.topics).toEqual(['add'])
    expect(d4.tags).toEqual(['motion'])
    expect(d4.resultsByDate['2026-10-19'].length).toBe(1)
    expect(d4.resultsByDate['2026-10-18'].length).toBe(2)
  })

  it('returns same paper twice on one date with results recorded in between', () => {
    const paper1 = generateDailyPaper('2026-10-20', null, ['components'], mockBankQuestions)

    // Record a result
    const daily = { topics: [], tags: [], resultsByDate: {} }
    const mockItem = { kind: 'topic', problem: { topic: 'add' } } as Item
    const res = { id: 'test1', title: 't1', right: true, hints: 0, seconds: 10 }
    recordResult(daily, '2026-10-20', mockItem, res)

    // Generate paper again on same date - should return the cached paper
    const paper2 = generateDailyPaper('2026-10-20', null, ['components'], mockBankQuestions)

    expect(paper1.map(p => p.kind === 'topic' ? p.problem.id : p.seed)).toEqual(paper2.map(p => p.kind === 'topic' ? p.problem.id : p.seed))
  })

  it('keeps studied topics and tags across days', () => {
    const daily = { topics: [], tags: [], resultsByDate: {} }
    const mockItemTopic = { kind: 'topic', problem: { topic: 'add' } } as Item
    const mockItemQ = { kind: 'question', question: { tags: ['motion'] } } as Item
    const res1 = { id: 'test1', title: 't1', right: true, hints: 0, seconds: 10 }

    // Day 1: study 'add' and 'motion'
    let d = recordResult(daily, '2026-10-18', mockItemTopic, res1)
    d = recordResult(d, '2026-10-18', mockItemQ, res1)

    // Day 2: topics and tags should still be there
    d = recordResult(d, '2026-10-19', mockItemTopic, res1)
    expect(d.topics).toEqual(['add'])
    expect(d.tags).toEqual(['motion'])
  })

  it('broken or blocked storage still gives a paper', () => {
    localStorageMock.mockError = true
    const paper = generateDailyPaper('2026-10-21', null, ['components'], mockBankQuestions)
    expect(paper.length).toBe(10)
    expect(paper.some(p => p.kind === 'topic')).toBe(true)
    expect(paper.some(p => p.kind === 'question')).toBe(true)
  })
})
