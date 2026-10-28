// PhysLab AI Command Registry Index
import { registry, CommandRegistry } from './registry'
import { sceneCommands } from './sceneCommands'
import { constructionCommands } from './constructionCommands'
import { graphCommands } from './graphCommands'
import { vectorCommands } from './vectorCommands'
import { sandboxCommands } from './sandboxCommands'
import { labCommands } from './labCommands'
import { appCommands } from './appCommands'

export * from './types'
export { registry, CommandRegistry }

// Initialize all command groups
const allCommandGroups = [
  sceneCommands,
  constructionCommands,
  graphCommands,
  vectorCommands,
  sandboxCommands,
  labCommands,
  appCommands
]

for (const group of allCommandGroups) {
  for (const cmd of group) {
    registry.register(cmd)
  }
}
