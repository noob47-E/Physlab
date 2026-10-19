import { generate, rngFor, TOPICS, type TopicId } from '../math/problems'
import type { PQQuestion } from '../questions/pqjson'
import type { Item, Result } from './Practice'

const DAILY_KEY = 'physlab.daily'
const PAPERS_KEY = 'physlab.daily.papers'

type StoredPaperItem =
  | { kind: 'topic'; topicId: TopicId; seed: number }
  | { kind: 'question'; questionId: string; seed: number }

interface StoredPaper {
  date: string
  items: StoredPaperItem[]
}

interface DailyState {
  topics: TopicId[]
  tags: string[]
  resultsByDate: Record<string, Result[]>
}

export function loadDaily(): DailyState | null {
  try {
    const raw = localStorage.getItem(DAILY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DailyState>
      return {
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        resultsByDate: (typeof parsed.resultsByDate === 'object' && parsed.resultsByDate !== null) ? parsed.resultsByDate : {}
      }
    }
  } catch {
    // Storage blocked or invalid JSON
  }
  return null
}

export function saveDaily(state: DailyState) {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(state))
  } catch {
    // Storage blocked
  }
}

function loadPapers(): Record<string, StoredPaper> {
  try {
    const raw = localStorage.getItem(PAPERS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, StoredPaper>
      return typeof parsed === 'object' && parsed !== null ? parsed : {}
    }
  } catch {
    // Storage blocked or invalid JSON
  }
  return {}
}

function savePapers(papers: Record<string, StoredPaper>) {
  try {
    localStorage.setItem(PAPERS_KEY, JSON.stringify(papers))
  } catch {
    // Storage blocked
  }
}

function storePaperForDate(dateStr: string, items: Item[], seeds: number[]) {
  const papers = loadPapers()
  papers[dateStr] = {
    date: dateStr,
    items: items.map((item, i) => {
      if (item.kind === 'topic') {
        return { kind: 'topic', topicId: item.problem.topic, seed: seeds[i] }
      } else {
        return { kind: 'question', questionId: item.question.id, seed: item.seed }
      }
    })
  }
  savePapers(papers)
}

function replayPaperForDate(dateStr: string, allQs: PQQuestion[]): Item[] | null {
  const papers = loadPapers()
  const storedPaper = papers[dateStr]
  if (!storedPaper) return null

  const items: Item[] = []
  for (const stored of storedPaper.items) {
    if (stored.kind === 'topic') {
      items.push({ kind: 'topic', problem: generate(stored.topicId, stored.seed) })
    } else {
      const question = allQs.find(q => q.id === stored.questionId)
      if (question) {
        items.push({ kind: 'question', question, seed: stored.seed })
      }
    }
  }
  return items.length > 0 ? items : null
}

export function generateDailyPaper(
  dateStr: string,
  history: Pick<DailyState, 'topics' | 'tags'> | null,
  chosenFallback: TopicId[],
  allQs: PQQuestion[]
): Item[] {
  // Check if paper for this date is already stored
  const cached = replayPaperForDate(dateStr, allQs)
  if (cached) return cached

  const seed = parseInt(dateStr.replace(/-/g, ''), 10)
  const r = rngFor(seed || 0)

  const histTopics = history?.topics.length ? history.topics : chosenFallback
  const histTags = history?.tags.length ? history.tags : []

  const dailyItems: Item[] = []
  const seeds: number[] = []

  // Pick 5 vector topics
  for (let i = 0; i < 5; i++) {
    const topic = histTopics[Math.floor(r() * histTopics.length)] || TOPICS[0].id
    const topicSeed = Math.floor(r() * 1e9)
    dailyItems.push({ kind: 'topic', problem: generate(topic, topicSeed) })
    seeds.push(topicSeed)
  }

  // Pick 5 bank questions, matching practiced tags if possible
  const pool = histTags.length > 0 ? allQs.filter((q) => q.tags?.some((t) => histTags.includes(t))) : allQs
  const sourcePool = pool.length > 0 ? pool : allQs

  for (let i = 0; i < 5; i++) {
    if (sourcePool.length > 0) {
      const q = sourcePool[Math.floor(r() * sourcePool.length)]
      const qSeed = Math.floor(r() * 1e9) + 1
      dailyItems.push({ kind: 'question', question: q, seed: qSeed })
      seeds.push(qSeed)
    }
  }

  // Shuffle them
  for (let i = dailyItems.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    const temp = dailyItems[i]
    dailyItems[i] = dailyItems[j]
    dailyItems[j] = temp
    const tempSeed = seeds[i]
    seeds[i] = seeds[j]
    seeds[j] = tempSeed
  }

  // Store this paper for the date
  storePaperForDate(dateStr, dailyItems, seeds)
  return dailyItems
}

export function recordResult(daily: DailyState, todayStr: string, item: Item, res: Result): DailyState {
  // Initialize results array for today if needed
  if (!daily.resultsByDate[todayStr]) {
    daily.resultsByDate[todayStr] = []
  }

  // Add the result for today
  daily.resultsByDate[todayStr].push(res)

  // Add topics and tags (accumulate across days, never wipe)
  if (item.kind === 'topic' && !daily.topics.includes(item.problem.topic)) {
    daily.topics.push(item.problem.topic)
  } else if (item.kind === 'question' && item.question.tags) {
    for (const t of item.question.tags) {
      if (!daily.tags.includes(t)) daily.tags.push(t)
    }
  }

  // Trim results to keep only last 30 days
  const sortedDates = Object.keys(daily.resultsByDate).sort().reverse()
  if (sortedDates.length > 30) {
    const datesToRemove = sortedDates.slice(30)
    for (const date of datesToRemove) {
      delete daily.resultsByDate[date]
    }
  }

  return daily
}
