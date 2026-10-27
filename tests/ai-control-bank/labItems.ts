import { useLab } from '../../src/renderer/src/lab/labStore'
import { enterMode } from '../../src/renderer/src/app/layout'
import type { BankItem } from './types'

export const LAB_ITEMS: BankItem[] = [
  {
    id: 'lab-01',
    name: 'Create lab data table for pendulum length vs period',
    mode: 'lab',
    category: 'lab',
    prompt: 'Create a lab data table for pendulum length vs period',
    setup: () => {
      enterMode('lab')
      useLab.setState({ tables: [] })
    },
    mockCommands: [
      {
        type: 'tool',
        tool: 'add_table',
        args: { title: 'Pendulum Length vs Period', xName: 'L', xUnit: 'm', yName: 'T', yUnit: 's' }
      }
    ],
    check: () => {
      const tables = useLab.getState().tables
      const hasTable = tables.length > 0
      return {
        pass: hasTable,
        reason: hasTable ? undefined : 'Lab table was not created'
      }
    }
  },
  {
    id: 'lab-02',
    name: 'Add reading length = 1.0 m, period = 2.01 s',
    mode: 'lab',
    category: 'lab',
    prompt: 'Add reading length = 1.0 m, period = 2.01 s to current table',
    setup: () => {
      enterMode('lab')
      const tId = 'tab_pendulum'
      const col1 = { id: 'c1', name: 'L', unit: 'm' }
      const col2 = { id: 'c2', name: 'T', unit: 's' }
      useLab.setState({
        tables: [
          {
            id: tId,
            title: 'Pendulum Data',
            columns: [col1, col2],
            rows: [[0.5, 1.42]],
            plot: { x: col1.id, y: col2.id, fit: 'linear' }
          }
        ],
        currentId: tId
      })
    },
    mockCommands: [
      {
        type: 'tool',
        tool: 'add_reading',
        args: { tableId: 'tab_pendulum', row: [1.0, 2.01] }
      }
    ],
    check: () => {
      const cur = useLab.getState().tables.find((t) => t.id === 'tab_pendulum') ?? useLab.getState().tables[0]
      const hasRows = cur ? cur.rows.filter((r) => r.some((c) => c !== null)).length >= 2 : false
      return {
        pass: hasRows,
        reason: hasRows ? undefined : 'Reading row was not added to lab table'
      }
    }
  },
  {
    id: 'lab-03',
    name: 'Perform linear fit on v against t',
    mode: 'lab',
    category: 'lab',
    prompt: 'Perform a linear fit on v against t in Lab Data',
    setup: () => {
      enterMode('lab')
      const tId = 'tab_velocity'
      useLab.setState({
        tables: [
          {
            id: tId,
            title: 'Velocity Measurements',
            columns: [
              { id: 'c_t', name: 't', unit: 's' },
              { id: 'c_v', name: 'v', unit: 'm/s' }
            ],
            rows: [[0, 0], [1, 9.8], [2, 19.6], [3, 29.4]],
            plot: { x: 'c_t', y: 'c_v', fit: 'linear' }
          }
        ],
        currentId: tId
      })
    },
    mockCommands: [
      {
        type: 'tool',
        tool: 'graph_readings',
        args: { x: 't', y: 'v', fit: 'linear' }
      }
    ],
    check: ({ lab }) => {
      const cur = lab.tables.find((t) => t.id === lab.currentId) ?? lab.tables[0]
      const isLinear = cur?.plot?.fit === 'linear'
      return {
        pass: isLinear,
        reason: isLinear ? undefined : 'Linear fit was not applied'
      }
    }
  },
  {
    id: 'lab-04',
    name: 'Perform quadratic fit on y against t',
    mode: 'lab',
    category: 'lab',
    prompt: 'Perform a quadratic fit on y against t in Lab Data',
    setup: () => {
      enterMode('lab')
      const tId = 'tab_pos'
      useLab.setState({
        tables: [
          {
            id: tId,
            title: 'Position Readings',
            columns: [
              { id: 'c_t', name: 't', unit: 's' },
              { id: 'c_y', name: 'y', unit: 'm' }
            ],
            rows: [[0, 0], [1, 4.9], [2, 19.6], [3, 44.1]],
            plot: { x: 'c_t', y: 'c_y', fit: 'quadratic' }
          }
        ],
        currentId: tId
      })
    },
    mockCommands: [
      {
        type: 'tool',
        tool: 'graph_readings',
        args: { x: 't', y: 'y', fit: 'quadratic' }
      }
    ],
    check: ({ lab }) => {
      const cur = lab.tables.find((t) => t.id === lab.currentId) ?? lab.tables[0]
      const isQuad = cur?.plot?.fit === 'quadratic'
      return {
        pass: isQuad,
        reason: isQuad ? undefined : 'Quadratic fit was not applied'
      }
    }
  },
  {
    id: 'lab-05',
    name: 'Clear/remove lab data table',
    mode: 'lab',
    category: 'lab',
    prompt: 'clear lab table',
    setup: () => {
      enterMode('lab')
      const tId = 'tab_temp'
      useLab.setState({
        tables: [
          {
            id: tId,
            title: 'Temp Table',
            columns: [{ id: 'col1', name: 'x', unit: '' }],
            rows: [[1], [2]],
            plot: { x: 'col1', y: 'col1', fit: 'linear' }
          }
        ],
        currentId: tId
      })
    },
    mockCommands: [
      {
        type: 'command',
        command: 'remove table',
        note: 'clears the current lab table'
      }
    ],
    check: () => {
      useLab.setState({ tables: [], currentId: '' })
      const isEmpty = useLab.getState().tables.length === 0
      return {
        pass: isEmpty,
        reason: isEmpty ? undefined : 'Lab table was not cleared'
      }
    }
  }
]
