// The cards for the drawing tools on the tool shelf, one per entry in render/tools.ts TOOLS.
//
// The title is the button's label and the shortcut its key, exactly as TOOLS spells them
// (tests/toolCards.test.ts holds the two in step). The sentence is the card's own: plainer and
// shorter than the tool's hint, because it sits under a picture that shows the clicks.
//
// Every card here is a real animation; AUTHORING.md has the pattern for a new one.

import type { ToolCardDef, ToolCardKey } from '../types'
import { Move } from './Move'
import { Sketch } from './Sketch'
import { Point } from './Point'
import { Vector } from './Vector'
import { Segment } from './Segment'
import { Line } from './Line'
import { Ray } from './Ray'
import { Circle } from './Circle'
import { Triangle } from './Triangle'
import { Polygon } from './Polygon'
import { Angle } from './Angle'
import { Measure } from './Measure'
import { Midpoint } from './Midpoint'
import { Perpendicular } from './Perpendicular'
import { Parallel } from './Parallel'
import { PerpBisector } from './PerpBisector'
import { AngleBisector } from './AngleBisector'
import { Intersect } from './Intersect'
import { Text } from './Text'
import { Delete } from './Delete'

export const TOOL_GROUP: Record<Extract<ToolCardKey, `tool:${string}`>, ToolCardDef> = {
  'tool:select': { title: 'Move', shortcut: 'V', sentence: 'Click to select, drag a point or a vector head to move it, or drag empty space to pan.', Animation: Move },
  'tool:sketch': { title: 'Sketch', shortcut: 'K', sentence: 'Draw a rough shape with the mouse and it becomes a neat square, rectangle, triangle, circle or line.', Animation: Sketch },
  'tool:point': { title: 'Point', shortcut: 'P', sentence: 'Click anywhere to place a point.', Animation: Point },
  'tool:vector': { title: 'Vector', shortcut: 'W', sentence: 'Drag from the tail to the head, or click the tail and then the head.', Animation: Vector },
  'tool:segment': { title: 'Segment', shortcut: 'S', sentence: 'Click each end, keep clicking for a chain, and close the loop to make a shape.', Animation: Segment },
  'tool:line': { title: 'Line', shortcut: 'L', sentence: 'Click two points and a line runs through both, on and on in each direction.', Animation: Line },
  'tool:ray': { title: 'Ray', shortcut: 'R', sentence: 'Click where the ray starts, then a point it passes through.', Animation: Ray },
  'tool:circle': { title: 'Circle', shortcut: 'C', sentence: 'Click the centre, then a point on the circle.', Animation: Circle },
  'tool:triangle': { title: 'Triangle', shortcut: 'T', sentence: 'Click the three corners.', Animation: Triangle },
  'tool:polygon': { title: 'Polygon', shortcut: 'G', sentence: 'Click each corner in turn, then click the first corner again to finish.', Animation: Polygon },
  'tool:angle': { title: 'Angle', shortcut: 'A', sentence: 'Click a point on one arm, the vertex, then a point on the other arm.', Animation: Angle },
  'tool:distance': { title: 'Measure', shortcut: 'D', sentence: 'Click two points to measure the distance between them.', Animation: Measure },
  'tool:midpoint': { title: 'Midpoint', shortcut: 'M', sentence: 'Click two points, or a segment, to mark the point halfway between.', Animation: Midpoint },
  'tool:perpendicular': { title: 'Perpendicular', sentence: 'Click a point and a line, in either order, for the line through the point at right angles.', Animation: Perpendicular },
  'tool:parallel': { title: 'Parallel', sentence: 'Click a point and a line, in either order, for the line through the point that never meets it.', Animation: Parallel },
  'tool:perpBisector': { title: 'Perp. bisector', sentence: 'Click two points, or a segment, for the line that cuts it in half at right angles.', Animation: PerpBisector },
  'tool:angleBisector': { title: 'Angle bisector', sentence: 'Click a point on one arm, the vertex, then the other arm, for the line that halves the angle.', Animation: AngleBisector },
  'tool:intersect': { title: 'Intersect', shortcut: 'I', sentence: 'Click two lines or circles to mark where they cross.', Animation: Intersect },
  'tool:text': { title: 'Text', sentence: 'Click where the note should go, then type.', Animation: Text },
  'tool:delete': { title: 'Delete', shortcut: 'X', sentence: 'Click an object to remove it; Undo brings it back.', Animation: Delete }
}
