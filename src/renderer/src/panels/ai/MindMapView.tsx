import { memo, useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Sparkles, Brain, BookOpen, AlertTriangle, Plus, Minus, RotateCcw } from 'lucide-react'
import type { MindMapData, MindMapNode, MindMapEdge } from '../../ai/types'

interface MindMapViewProps {
  data: MindMapData | null
  onNodeClick?: (node: MindMapNode) => void
}

const CATEGORY_COLORS: Record<MindMapNode['category'], { fill: string; stroke: string; text: string }> = {
  physics: { fill: 'var(--bg-1)', stroke: 'var(--mode-sandbox)', text: 'var(--mode-sandbox)' },
  math: { fill: 'var(--bg-1)', stroke: 'var(--accent)', text: 'var(--accent)' },
  trap: { fill: 'var(--bg-1)', stroke: 'var(--bad)', text: 'var(--bad)' },
  concept: { fill: 'var(--bg-1)', stroke: 'var(--good)', text: 'var(--good)' }
}

export const MindMapView = memo(function MindMapView({ data, onNodeClick }: MindMapViewProps) {
  const [selectedNode, setSelectedNode] = useState<MindMapNode | null>(null)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({})

  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingCanvas = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const draggingNodeRef = useRef<{ id: string; startX: number; startY: number; nodeStartX: number; nodeStartY: number } | null>(null)

  // Attach non-passive wheel listener for smooth zoom centered around cursor
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87

      setScale((prevScale) => {
        const nextScale = Math.min(3.5, Math.max(0.35, prevScale * zoomFactor))
        if (nextScale === prevScale) return prevScale

        setPan((prevPan) => {
          const factor = nextScale / prevScale
          const newPanX = mouseX - (mouseX - prevPan.x) * factor
          const newPanY = mouseY - (mouseY - prevPan.y) * factor
          return { x: newPanX, y: newPanY }
        })

        return nextScale
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Compute initial layout when data changes
  useEffect(() => {
    if (!data || !data.nodes || data.nodes.length === 0) {
      setNodePositions({})
      return
    }

    const initialPositions: Record<string, { x: number; y: number }> = {}
    data.nodes.forEach((node, i) => {
      if (i === 0) {
        // Root node at top center
        initialPositions[node.id] = { x: 180, y: 60 }
      } else {
        // Remaining nodes arranged in 2 clean columns (x = 95 and x = 265) with 95px vertical spacing
        const row = Math.floor((i - 1) / 2)
        const col = (i - 1) % 2
        const x = col === 0 ? 95 : 265
        const y = 150 + row * 95
        initialPositions[node.id] = { x, y }
      }
    })

    setNodePositions(initialPositions)
    setPan({ x: 0, y: 0 })
    setScale(1)
  }, [data])

  // Combine positioned nodes
  const layout = useMemo(() => {
    if (!data || !data.nodes || data.nodes.length === 0) return { nodes: [], edges: [] }

    const positionedNodes = data.nodes.map((node) => {
      const pos = nodePositions[node.id] || { x: 250, y: 180 }
      return { ...node, x: pos.x, y: pos.y }
    })

    const nodeMap = new Map(positionedNodes.map((n) => [n.id, n]))

    const positionedEdges = (data.edges || [])
      .map((e: MindMapEdge) => {
        const source = nodeMap.get(e.source)
        const target = nodeMap.get(e.target)
        if (!source || !target || source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) {
          return null
        }
        return {
          ...e,
          x1: source.x,
          y1: source.y,
          x2: target.x,
          y2: target.y
        }
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)

    return { nodes: positionedNodes, edges: positionedEdges }
  }, [data, nodePositions])

  // Pointer down on background: start pan
  const handleSvgPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName !== 'svg') return
    isDraggingCanvas.current = true
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y
    }
  }

  // Pointer move: pan canvas or drag node
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (draggingNodeRef.current) {
      const { id, startX, startY, nodeStartX, nodeStartY } = draggingNodeRef.current
      const dx = (e.clientX - startX) / scale
      const dy = (e.clientY - startY) / scale
      setNodePositions((prev) => ({
        ...prev,
        [id]: { x: nodeStartX + dx, y: nodeStartY + dy }
      }))
    } else if (isDraggingCanvas.current) {
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setPan({
        x: dragStart.current.panX + dx,
        y: dragStart.current.panY + dy
      })
    }
  }, [scale])

  const handlePointerUp = useCallback(() => {
    isDraggingCanvas.current = false
    draggingNodeRef.current = null
  }, [])

  // Start dragging a node
  const handleNodePointerDown = (e: React.PointerEvent, nodeId: string) => {
    e.stopPropagation()
    const currentPos = nodePositions[nodeId] || { x: 250, y: 180 }
    draggingNodeRef.current = {
      id: nodeId,
      startX: e.clientX,
      startY: e.clientY,
      nodeStartX: currentPos.x,
      nodeStartY: currentPos.y
    }
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-ink-dim gap-2 h-full">
        <Brain size={32} className="text-ink-faint mb-1" />
        <span className="font-medium text-body text-ink">No Concept Mind Map Generated Yet</span>
        <span className="text-small text-ink-faint max-w-xs">
          Ask PhysLab AI to &quot;Build Calculus &amp; Mechanics Mind Map&quot; to visualize your concepts!
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative bg-surface-0 select-none">
      {/* Top Map Header */}
      <div className="flex items-center justify-between p-2.5 border-b border-line bg-surface-1">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-accent" />
          <span className="font-semibold text-small text-ink-strong">Obsidian Concept Mind Map</span>
        </div>
        <div className="flex items-center gap-2 text-fine text-ink-dim">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--mode-sandbox)' }} />
            Physics
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--accent)' }} />
            Math
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--bad)' }} />
            Trap
          </span>
        </div>
      </div>

      {/* SVG Canvas with Zoom & Pan */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        onPointerDown={handleSvgPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 360 560"
          className="w-full h-full"
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
            {/* Edge Connection Curves */}
            {layout.edges.map((e, idx) => {
              const mx = (e.x1 + e.x2) / 2
              const my = (e.y1 + e.y2) / 2
              return (
                <g key={`edge_${idx}`}>
                  <path
                    d={`M ${e.x1} ${e.y1} Q ${mx + 10} ${my - 10} ${e.x2} ${e.y2}`}
                    fill="none"
                    stroke="var(--line-2)"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                  />
                  {e.label && (
                    <text
                      x={mx}
                      y={my - 4}
                      fill="var(--text-faint)"
                      fontSize="9"
                      textAnchor="middle"
                      className="font-mono"
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Draggable Node Cards */}
            {layout.nodes.map((node) => {
              const isSelected = selectedNode?.id === node.id
              const colors = CATEGORY_COLORS[node.category] || CATEGORY_COLORS.concept

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-move"
                  onPointerDown={(e) => handleNodePointerDown(e, node.id)}
                  onClick={() => {
                    setSelectedNode(node)
                    onNodeClick?.(node)
                  }}
                >
                  {/* Node Pill Background */}
                  <rect
                    x="-72.5"
                    y="-26"
                    width="145"
                    height="52"
                    rx="10"
                    fill={colors.fill}
                    stroke={isSelected ? 'var(--text-strong)' : colors.stroke}
                    strokeWidth={isSelected ? '2.5' : '1.5'}
                  />

                  {/* Node Label */}
                  <text
                    x="0"
                    y="-3"
                    fill="var(--text-strong)"
                    fontSize="11"
                    fontWeight="600"
                    textAnchor="middle"
                    className="font-ui"
                  >
                    {node.label}
                  </text>

                  {/* Subtitle / Category */}
                  <text
                    x="0"
                    y="13"
                    fill={colors.text}
                    fontSize="9"
                    textAnchor="middle"
                    className="font-mono uppercase tracking-wider"
                  >
                    {node.category}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        {/* Floating Zoom & Pan Controls (Bottom-Right) */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 p-1 rounded-md bg-surface-1 border border-line shadow-md">
          <button
            type="button"
            title="Zoom In"
            onClick={() => setScale((s) => Math.min(3.5, s * 1.2))}
            className="p-1 rounded text-ink-dim hover:text-ink hover:bg-surface-2 cursor-pointer"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            title="Zoom Out"
            onClick={() => setScale((s) => Math.max(0.35, s * 0.8))}
            className="p-1 rounded text-ink-dim hover:text-ink hover:bg-surface-2 cursor-pointer"
          >
            <Minus size={14} />
          </button>
          <div className="w-px h-3 bg-line mx-0.5" />
          <button
            type="button"
            title="Reset View"
            onClick={() => {
              setScale(1)
              setPan({ x: 0, y: 0 })
            }}
            className="p-1 rounded text-ink-dim hover:text-ink hover:bg-surface-2 cursor-pointer"
          >
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* Selected Node Details Drawer */}
      {selectedNode && (
        <div className="border-t border-line bg-surface-1 p-3 flex flex-col gap-2 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-small text-ink-strong">
              {selectedNode.category === 'trap' ? (
                <AlertTriangle size={14} className="text-bad" />
              ) : (
                <BookOpen size={14} className="text-accent" />
              )}
              <span>{selectedNode.label}</span>
              <span className="text-fine font-mono uppercase text-ink-dim px-1.5 py-0.2 rounded bg-surface-2">
                {selectedNode.category}
              </span>
            </div>
            <button
              type="button"
              className="text-fine text-ink-dim hover:text-ink cursor-pointer"
              onClick={() => setSelectedNode(null)}
            >
              Close
            </button>
          </div>

          {selectedNode.summary && (
            <p className="text-small text-ink-dim">{selectedNode.summary}</p>
          )}

          {selectedNode.formula && (
            <div className="p-1.5 rounded bg-surface-0 border border-line font-mono text-fine text-code text-center">
              {selectedNode.formula}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded bg-accent text-fine font-medium text-on-accent hover:bg-accent-2 transition-colors cursor-pointer"
              onClick={() => onNodeClick?.(selectedNode)}
            >
              <Sparkles size={12} />
              <span>Ask AI to Drill into Concept</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
})
