import type { BankItem } from './types'
import { GEOMETRY_ITEMS } from './geometryItems'
import { GRAPHING_ITEMS } from './graphingItems'
import { VECTORS_ITEMS } from './vectorsItems'
import { SANDBOX_ITEMS } from './sandboxItems'
import { LAB_ITEMS } from './labItems'
import { APP_ITEMS } from './appItems'
import { TRICKY_ITEMS } from './trickyItems'

export const BANK_ITEMS: BankItem[] = [
  ...GEOMETRY_ITEMS,
  ...GRAPHING_ITEMS,
  ...VECTORS_ITEMS,
  ...SANDBOX_ITEMS,
  ...LAB_ITEMS,
  ...APP_ITEMS,
  ...TRICKY_ITEMS
]

export {
  GEOMETRY_ITEMS,
  GRAPHING_ITEMS,
  VECTORS_ITEMS,
  SANDBOX_ITEMS,
  LAB_ITEMS,
  APP_ITEMS,
  TRICKY_ITEMS
}
