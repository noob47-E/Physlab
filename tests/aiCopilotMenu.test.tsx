import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'

// Minimal DOM mock to allow mounting AiCopilot in pure node environment
class MockNode {
  nodeType: number
  nodeName: string
  tagName: string
  childNodes: MockNode[] = []
  parentNode: MockNode | null = null
  style: Record<string, any> = {}
  ownerDocument: any = null
  listeners: Record<string, ((e: any) => void)[]> = {}
  attributes: Record<string, string> = {}
  className = ''
  nodeValue: string | null = null
  title = ''
  options: MockNode[] = []

  constructor(type: number, name = '') {
    this.nodeType = type
    this.nodeName = name
    this.tagName = name
  }

  appendChild(child: MockNode) {
    child.parentNode = this
    this.childNodes.push(child)
    return child
  }

  insertBefore(child: MockNode, ref: MockNode | null) {
    if (!ref) return this.appendChild(child)
    const idx = this.childNodes.indexOf(ref)
    if (idx === -1) return this.appendChild(child)
    child.parentNode = this
    this.childNodes.splice(idx, 0, child)
    return child
  }

  removeChild(child: MockNode) {
    const idx = this.childNodes.indexOf(child)
    if (idx !== -1) {
      child.parentNode = null
      this.childNodes.splice(idx, 1)
    }
    return child
  }

  setAttribute(k: string, v: string) {
    this.attributes[k] = v
    if (k === 'class' || k === 'className') this.className = v
    if (k === 'title') this.title = v
  }

  removeAttribute(k: string) {
    delete this.attributes[k]
  }

  getAttribute(k: string) {
    return this.attributes[k] ?? null
  }

  addEventListener(type: string, fn: (e: any) => void) {
    this.listeners[type] = this.listeners[type] || []
    this.listeners[type].push(fn)
  }

  removeEventListener(type: string, fn: (e: any) => void) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((f) => f !== fn)
    }
  }

  dispatchEvent(event: any) {
    event.target = this
    let curr: MockNode | null = this
    while (curr) {
      const handlers = curr.listeners[event.type] || []
      for (const h of handlers) h.call(curr, event)
      if (event.cancelBubble) break
      curr = curr.parentNode
    }
    return true
  }

  scrollIntoView() {}

  get textContent(): string {
    if (this.nodeType === 3) return this.nodeValue || ''
    return this.childNodes.map((c) => c.textContent).join('')
  }

  set textContent(val: string) {
    this.childNodes = []
    if (val) {
      const t = this.ownerDocument ? this.ownerDocument.createTextNode(val) : new MockNode(3, '#text')
      t.nodeValue = val
      this.appendChild(t)
    }
  }
}

;(global as any).IS_REACT_ACT_ENVIRONMENT = true
;(global as any).Node = MockNode
;(global as any).Element = MockNode
;(global as any).HTMLElement = MockNode

const win: any = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  location: { search: '' },
  HTMLIFrameElement: class {},
  physlab: {
    ai: {
      hasKey: vi.fn().mockResolvedValue(false),
      getKey: vi.fn().mockResolvedValue(null),
      setKey: vi.fn().mockResolvedValue({ ok: true }),
      removeKey: vi.fn().mockResolvedValue({ ok: true }),
      testConnection: vi.fn().mockResolvedValue({ ok: true, message: 'Connected' }),
      listRemoteModels: vi.fn().mockResolvedValue({ ok: true, models: [] })
    }
  }
}
;(global as any).window = win

const doc: any = new MockNode(9, '#document')
doc.defaultView = win
win.document = doc
doc.createElement = (tag: string) => {
  const el = new MockNode(1, tag.toUpperCase())
  el.ownerDocument = doc
  return el
}
doc.createElementNS = (_ns: string, tag: string) => doc.createElement(tag)
doc.createTextNode = (text: string) => {
  const n = new MockNode(3, '#text')
  n.nodeValue = text
  n.ownerDocument = doc
  return n
}
doc.createComment = (text: string) => {
  const n = new MockNode(8, '#comment')
  n.nodeValue = text
  n.ownerDocument = doc
  return n
}
doc.ownerDocument = doc
;(global as any).document = doc

function findAll(node: MockNode, predicate: (n: MockNode) => boolean): MockNode[] {
  const matches: MockNode[] = []
  if (predicate(node)) matches.push(node)
  for (const child of node.childNodes) {
    matches.push(...findAll(child, predicate))
  }
  return matches
}

import { AiCopilot } from '../src/renderer/src/panels/AiCopilot'

describe('Fix 0: AiCopilot Header Dropdown Menu Items Clickability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AiCopilot header contains relative z-20 so dropdown is not trapped', async () => {
    const container = doc.createElement('div')
    const root = createRoot(container as any)

    await act(async () => {
      root.render(React.createElement(AiCopilot))
    })

    // Find the header div
    const headers = findAll(container, (n) =>
      typeof n.className === 'string' &&
      n.className.includes('backdrop-blur-sm') &&
      n.className.includes('border-b')
    )
    expect(headers.length).toBeGreaterThan(0)
    const header = headers[0]
    expect(header.className).toContain('relative')
    expect(header.className).toContain('z-20')
  })

  it('clicks "⋯" button and navigates to Mind Map, Goals & Memory, AI Provider Settings', async () => {
    const container = doc.createElement('div')
    const root = createRoot(container as any)

    await act(async () => {
      root.render(React.createElement(AiCopilot))
    })

    // 1. Initially on Chat tab
    let text = container.textContent
    expect(text).toContain('AI Tutor')

    // 2. Click "⋯" button (More options)
    const moreBtn = findAll(container, (n) =>
      n.tagName === 'BUTTON' && (n.title === 'More options' || n.getAttribute('title') === 'More options')
    )[0]
    expect(moreBtn).toBeDefined()

    await act(async () => {
      moreBtn.dispatchEvent({ type: 'click', bubbles: true })
    })

    // Dropdown should now be open
    let menuButtons = findAll(container, (n) => n.tagName === 'BUTTON')
    let mindmapBtn = menuButtons.find((b) => b.textContent.includes('Mind Map'))
    expect(mindmapBtn).toBeDefined()

    // 3. Click Mind Map menu item
    await act(async () => {
      mindmapBtn!.dispatchEvent({ type: 'click', bubbles: true })
    })

    text = container.textContent
    expect(text).toContain('Mind Map')

    // 4. Open menu again and click Goals & Memory
    const moreBtn2 = findAll(container, (n) =>
      n.tagName === 'BUTTON' && (n.title === 'More options' || n.getAttribute('title') === 'More options')
    )[0]
    expect(moreBtn2).toBeDefined()

    await act(async () => {
      moreBtn2.dispatchEvent({ type: 'click', bubbles: true })
    })

    menuButtons = findAll(container, (n) => n.tagName === 'BUTTON')
    const goalsBtn = menuButtons.find((b) => b.textContent.includes('Goals & Memory'))
    expect(goalsBtn).toBeDefined()

    await act(async () => {
      goalsBtn!.dispatchEvent({ type: 'click', bubbles: true })
    })

    text = container.textContent
    expect(text).toContain('Student Goals')

    // 5. Open menu again and click AI Provider Settings
    const moreBtn3 = findAll(container, (n) =>
      n.tagName === 'BUTTON' && (n.title === 'More options' || n.getAttribute('title') === 'More options')
    )[0]
    expect(moreBtn3).toBeDefined()

    await act(async () => {
      moreBtn3.dispatchEvent({ type: 'click', bubbles: true })
    })

    menuButtons = findAll(container, (n) => n.tagName === 'BUTTON')
    const settingsBtn = menuButtons.find((b) => b.textContent.includes('AI Provider Settings'))
    expect(settingsBtn).toBeDefined()

    await act(async () => {
      settingsBtn!.dispatchEvent({ type: 'click', bubbles: true })
    })

    text = container.textContent
    expect(text).toContain('Settings')

    // 6. Return to Chat tab via menu
    const moreBtn4 = findAll(container, (n) =>
      n.tagName === 'BUTTON' && (n.title === 'More options' || n.getAttribute('title') === 'More options')
    )[0]
    expect(moreBtn4).toBeDefined()

    await act(async () => {
      moreBtn4.dispatchEvent({ type: 'click', bubbles: true })
    })

    menuButtons = findAll(container, (n) => n.tagName === 'BUTTON')
    const chatBtn = menuButtons.find((b) => b.textContent.includes('Chat'))
    expect(chatBtn).toBeDefined()

    await act(async () => {
      chatBtn!.dispatchEvent({ type: 'click', bubbles: true })
    })

    text = container.textContent
    expect(text).toContain('AI Tutor')
  })
})
