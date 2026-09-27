import type { CSSProperties } from 'react'
import { formatDaysAgo } from '@/lib/format'
import { ringLayout } from './layout'
import { edgeOpacity } from './opacity'
import type { GraphNode } from './read'

export interface GraphSvgProps {
  nodes: GraphNode[]
  now: number
}

const size = 320
const centre = { x: size / 2, y: size / 2 }

/**
 * Deterministic per-node drift so the ring never moves in lockstep: each friend floats along its
 * own small path at its own pace. Offsets stay under the centre circle's radius, so lines still
 * start behind "You".
 */
export function driftFor(index: number): { x: string; y: string; duration: string } {
  const angle = index * 2.39996 // golden angle, spreads directions evenly for any count
  return {
    x: `${(4 * Math.cos(angle)).toFixed(2)}px`,
    y: `${(4 * Math.sin(angle)).toFixed(2)}px`,
    duration: `${(5 + (index % 4) * 0.9).toFixed(1)}s`,
  }
}

/** The personal graph: the viewer in the middle, their mutual friends around them. */
export function GraphSvg({ nodes, now }: GraphSvgProps) {
  const points = ringLayout(nodes.length, centre, size * 0.38)
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Your connections"
      className="graph w-full max-w-sm overflow-visible"
    >
      <circle className="graph-pulse" cx={centre.x} cy={centre.y} r={18} fill="#047857" />
      {nodes.map((node, index) => {
        const point = points[index]!
        const drift = driftFor(index)
        // Labels sit on the side facing away from the centre so the line never crosses them.
        const above = point.y < centre.y - 1
        const nameY = above ? point.y - 29 : point.y + 26
        const agoY = above ? point.y - 19 : point.y + 37
        const style = {
          '--i': index,
          '--dx': drift.x,
          '--dy': drift.y,
          '--drift-duration': drift.duration,
        } as CSSProperties
        return (
          <g key={node.userId} className="graph-friend" style={style}>
            <line
              className="graph-edge"
              pathLength={1}
              x1={centre.x}
              y1={centre.y}
              x2={point.x}
              y2={point.y}
              stroke="#047857"
              strokeWidth={3}
              strokeLinecap="round"
              strokeOpacity={edgeOpacity(node.lastMetAt, now)}
            />
            <g className="graph-node">
              <circle
                className="graph-dot"
                cx={point.x}
                cy={point.y}
                r={14}
                fill="#d1fae5"
                stroke="#047857"
              />
              <text x={point.x} y={nameY} textAnchor="middle" fontSize={10} fill="#44403c">
                {node.name}
              </text>
              <text x={point.x} y={agoY} textAnchor="middle" fontSize={8} fill="#78716c">
                {formatDaysAgo(node.lastMetAt, now)}
              </text>
            </g>
          </g>
        )
      })}
      <circle cx={centre.x} cy={centre.y} r={18} fill="#1c1917" />
      <text x={centre.x} y={centre.y + 4} textAnchor="middle" fontSize={10} fill="#fafaf9">
        You
      </text>
    </svg>
  )
}
