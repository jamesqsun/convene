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

/** The personal graph: the viewer in the middle, everyone they have met around them. */
export function GraphSvg({ nodes, now }: GraphSvgProps) {
  const points = ringLayout(nodes.length, centre, size * 0.38)
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Your connections"
      className="w-full max-w-sm"
    >
      {nodes.map((node, index) => {
        const point = points[index]!
        return (
          <line
            key={`edge-${node.userId}`}
            x1={centre.x}
            y1={centre.y}
            x2={point.x}
            y2={point.y}
            stroke={node.isFriend ? '#047857' : '#78716c'}
            strokeWidth={node.isFriend ? 3 : 1.5}
            strokeDasharray={node.isFriend ? undefined : '4 4'}
            strokeOpacity={edgeOpacity(node.lastMetAt, now)}
          />
        )
      })}
      {nodes.map((node, index) => {
        const point = points[index]!
        return (
          <g key={node.userId}>
            <circle
              cx={point.x}
              cy={point.y}
              r={14}
              fill={node.isFriend ? '#d1fae5' : '#f5f5f4'}
              stroke={node.isFriend ? '#047857' : '#a8a29e'}
            />
            <text x={point.x} y={point.y + 26} textAnchor="middle" fontSize={10} fill="#44403c">
              {node.name}
            </text>
            <text x={point.x} y={point.y + 37} textAnchor="middle" fontSize={8} fill="#78716c">
              {formatDaysAgo(node.lastMetAt, now)}
            </text>
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
