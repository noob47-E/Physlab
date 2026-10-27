import { runAllBankItems } from '../tests/ai-control-bank/runner'
import type { BankCategory } from '../tests/ai-control-bank/types'

async function main() {
  const args = process.argv.slice(2)
  const isLive = args.includes('--live')

  let costCap = 5.0
  const capIdx = args.indexOf('--cap')
  if (capIdx !== -1 && args[capIdx + 1]) {
    costCap = parseFloat(args[capIdx + 1]) || 5.0
  }

  let filterCategory: BankCategory | undefined
  const catIdx = args.indexOf('--category')
  if (catIdx !== -1 && args[catIdx + 1]) {
    filterCategory = args[catIdx + 1] as BankCategory
  }

  let filterId: string | undefined
  const idIdx = args.indexOf('--id')
  if (idIdx !== -1 && args[idIdx + 1]) {
    filterId = args[idIdx + 1]
  }

  // eslint-disable-next-line no-console
  console.log(`Starting AI Control Bank Benchmark (${isLive ? 'LIVE' : 'MOCK'} mode)...`)
  if (isLive) {
    // eslint-disable-next-line no-console
    console.log(`Strict cost cap: $${costCap.toFixed(2)}`)
  }

  const report = await runAllBankItems({
    live: isLive,
    costCapDollars: costCap,
    filterCategory,
    filterId,
    silent: false
  })

  // eslint-disable-next-line no-console
  console.log('\n========================================')
  // eslint-disable-next-line no-console
  console.log(`Total: ${report.passedItems}/${report.totalItems} passed (${report.scorePct.toFixed(1)}%)`)
  // eslint-disable-next-line no-console
  console.log(`False Claims: ${report.falseClaimsCount}`)
  // eslint-disable-next-line no-console
  console.log(`Estimated Cost: $${report.estimatedCost.toFixed(3)}`)
  // eslint-disable-next-line no-console
  console.log('========================================\n')

  if (report.passedItems < report.totalItems) {
    process.exit(1)
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal benchmark runner error:', err)
  process.exit(1)
})
