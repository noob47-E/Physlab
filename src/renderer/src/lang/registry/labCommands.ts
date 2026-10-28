// Lab Data Commands: table, column, row, fit, export
import { useLab, addRow, addColumn, setCell } from '../../lab/labStore'
import { fitOf } from '../../lab/fit'
import { toCsv } from '../../lab/csv'
import { resolveValues } from '../../lab/values'
import type { LabTable, FitShape } from '../../lab/types'
import type { CommandEntry, RegistryResult } from './types'

function getTable(nameOrId?: string): LabTable | undefined {
  const store = useLab.getState()
  if (!nameOrId) return store.tables.find((t) => t.id === store.currentId) ?? store.tables[0]
  return store.tables.find((t) => t.id === nameOrId || t.title.toLowerCase() === nameOrId.toLowerCase())
}

export const labCommands: CommandEntry[] = [
  {
    name: 'table',
    modes: ['lab'],
    args: [
      { name: 'name', type: 'string', required: true, description: 'Table title' },
      { name: 'columns', type: 'string', required: false, description: 'Comma-separated column names (e.g. "time/s, dist/m")' }
    ],
    summary: 'Create a new data table in Lab Data',
    examples: ['table Pendulum', 'table Motion t/s, x/m, v/m/s'],
    parse: (raw) => {
      const m = raw.match(/^table(?:\s+new)?\s+(\S+)(?:\s+(.+))?$/i)
      return m ? { name: m[1], columns: m[2]?.trim() } : null
    },
    run: (args): RegistryResult => {
      const store = useLab.getState()
      const title = String(args.name ?? 'Experiment').trim()
      const colDefs = args.columns ? String(args.columns).split(/[,\s]+/).filter(Boolean) : ['x', 'y']

      const columns = colDefs.map((c, i) => {
        const parts = c.split('/')
        return {
          id: `col_${i + 1}`,
          name: parts[0],
          unit: parts[1] ?? ''
        }
      })

      const newTable: LabTable = {
        id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        columns,
        rows: [],
        plot: {
          x: columns[0]?.id ?? 'col_1',
          y: columns[1]?.id ?? (columns[0]?.id ?? 'col_1'),
          fit: 'linear'
        }
      }

      store.appendTable(newTable)
      return { ok: true, created: [newTable.id], removed: [], changed: [], message: `Created table "${title}" with ${newTable.columns.length} columns.` }
    }
  },
  {
    name: 'column',
    modes: ['lab'],
    args: [
      { name: 'action', type: 'string', required: true, description: 'add or remove' },
      { name: 'colName', type: 'string', required: true, description: 'Column name' },
      { name: 'unit', type: 'string', required: false, description: 'Optional unit' }
    ],
    summary: 'Add or remove a column in the current Lab Data table',
    examples: ['column add velocity m/s', 'column remove velocity'],
    parse: (raw) => {
      const m = raw.match(/^column\s+(add|remove)\s+(\S+)(?:\s+(\S+))?$/i)
      return m ? { action: m[1].toLowerCase(), colName: m[2], unit: m[3] } : null
    },
    run: (args): RegistryResult => {
      const store = useLab.getState()
      const table = getTable()
      if (!table) return { ok: false, created: [], removed: [], changed: [], message: 'No active Lab Data table found.' }

      const action = args.action
      const colName = String(args.colName ?? '').trim()

      if (action === 'add') {
        const next = addColumn(table, { name: colName, unit: args.unit ?? '' })
        store.update(table.id, () => next)
        return { ok: true, created: [], removed: [], changed: [table.id], message: `Added column "${colName}" to ${table.title}.` }
      }

      if (action === 'remove') {
        const col = table.columns.find((c) => c.name === colName || c.id === colName)
        if (!col) return { ok: false, created: [], removed: [], changed: [], message: `Column "${colName}" not found.` }
        const next = {
          ...table,
          columns: table.columns.filter((c) => c.id !== col.id),
          rows: table.rows.map((r) => r.filter((_, idx) => table.columns[idx]?.id !== col.id))
        }
        store.update(table.id, () => next)
        return { ok: true, created: [], removed: [], changed: [table.id], message: `Removed column "${colName}" from ${table.title}.` }
      }

      return { ok: false, created: [], removed: [], changed: [], message: 'Usage: column add <name> [unit] or column remove <name>' }
    }
  },
  {
    name: 'row',
    modes: ['lab'],
    args: [
      { name: 'values', type: 'string', required: true, description: 'Numerical row values' }
    ],
    summary: 'Add a row of readings to the active Lab Data table',
    examples: ['row add 1.0 2.5 4.9', 'row 0.1 0.2'],
    parse: (raw) => {
      const m = raw.match(/^row(?:\s+add)?\s+(.+)$/i)
      return m ? { values: m[1].trim() } : null
    },
    run: (args): RegistryResult => {
      const store = useLab.getState()
      const table = getTable()
      if (!table) return { ok: false, created: [], removed: [], changed: [], message: 'No active Lab Data table found.' }

      const vals = String(args.values ?? '')
        .split(/[,\s]+/)
        .map((v) => {
          const n = parseFloat(v)
          return isNaN(n) ? null : n
        })

      let next = addRow(table)
      const rowIndex = next.rows.length - 1
      for (let c = 0; c < Math.min(vals.length, next.columns.length); c++) {
        next = setCell(next, rowIndex, c, vals[c])
      }
      store.update(table.id, () => next)
      return { ok: true, created: [], removed: [], changed: [table.id], message: `Added row [${vals.join(', ')}] to ${table.title}.` }
    }
  },
  {
    name: 'fit',
    modes: ['lab'],
    args: [
      { name: 'shape', type: 'string', required: false, description: 'linear, quadratic, power, exponential, proportional' }
    ],
    summary: 'Fit a line or curve to active Lab Data readings',
    examples: ['fit linear', 'fit quadratic', 'fit proportional'],
    parse: (raw) => {
      const m = raw.match(/^fit(?:\s+(\w+))?$/i)
      return m ? { shape: m[1]?.toLowerCase() } : null
    },
    run: (args): RegistryResult => {
      const table = getTable()
      if (!table) return { ok: false, created: [], removed: [], changed: [], message: 'No active Lab Data table found.' }

      const resolved = resolveValues(table)
      if (table.columns.length < 2 || resolved.values.length < 2) {
        return { ok: false, created: [], removed: [], changed: [], message: 'Table needs at least 2 columns and 2 rows with data to fit.' }
      }

      const xs: number[] = []
      const ys: number[] = []
      for (const row of resolved.values) {
        const x = row[0]
        const y = row[1]
        if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
          xs.push(x)
          ys.push(y)
        }
      }

      if (xs.length < 2) {
        return { ok: false, created: [], removed: [], changed: [], message: 'Insufficient numerical pairs to fit.' }
      }

      const shape = (args.shape || 'linear') as FitShape
      const fit = fitOf(xs, ys, shape)
      if (!fit) {
        return { ok: false, created: [], removed: [], changed: [], message: `Could not fit ${shape} curve to data.` }
      }

      return {
        ok: true,
        created: [],
        removed: [],
        changed: [],
        message: `Fit (${fit.shape}): ${fit.label}, R² = ${fit.r2.toFixed(4)}${fit.slope !== undefined ? `, slope = ${fit.slope.toFixed(4)}` : ''}.`
      }
    }
  },
  {
    name: 'exportlab',
    aliases: ['exportcsv'],
    modes: ['lab'],
    args: [],
    summary: 'Export active Lab Data table as CSV text',
    examples: ['exportlab', 'exportcsv'],
    parse: (raw) => (raw.trim().toLowerCase() === 'exportlab' || raw.trim().toLowerCase() === 'exportcsv' ? {} : null),
    run: (): RegistryResult => {
      const table = getTable()
      if (!table) return { ok: false, created: [], removed: [], changed: [], message: 'No active Lab Data table.' }
      const resolved = resolveValues(table)
      const csv = toCsv(table, resolved)
      return { ok: true, created: [], removed: [], changed: [], message: `Exported ${table.title}:\n${csv}` }
    }
  }
]
