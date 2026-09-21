import { RotateCcw } from 'lucide-react'
import { useParticleLab } from '../render/GpuParticles'
import { useGpuInfo } from '../render/renderer'
import { NumField } from '../ui/fields'

export function GpuLab() {
  const lab = useParticleLab()
  const gpu = useGpuInfo()
  const set = useParticleLab.setState
  return (
    <div className="panel p-3">
      <div className="mb-2 text-ink">
        Charged particles in uniform electric and magnetic fields, <b>F = q(E + v × B)</b>, integrated on the GPU every frame. With B along z the particles spiral
        (cyclotron motion); adding E makes them drift sideways (E × B drift).
      </div>
      <div className="mb-3 text-small text-ink-faint">
        Renderer: <span className="text-ink">{gpu.backend}</span> {gpu.adapter && `· ${gpu.adapter}`}
        {gpu.backend !== 'WebGPU' && <span className="ml-2 text-warn">(GPU compute needs WebGPU)</span>}
      </div>
      <div className="grid max-w-3xl grid-cols-[110px_1fr] items-center gap-x-3 gap-y-2">
        <label className="text-ink-dim">Enabled</label>
        <div>
          <button className={`btn ${lab.enabled ? 'primary' : ''}`} onClick={() => set({ enabled: !lab.enabled })}>
            {lab.enabled ? 'Running' : 'Start simulation'}
          </button>
          <button className="btn ml-2" onClick={() => set({ resetNonce: Date.now() })}>
            <RotateCcw size={13} /> Reset
          </button>
        </div>
        <label className="text-ink-dim">Particles</label>
        <div className="seg w-fit">
          {[100_000, 500_000, 1_000_000, 2_000_000].map((n) => (
            <button key={n} className={lab.count === n ? 'on' : ''} onClick={() => set({ count: n })}>
              {n >= 1e6 ? `${n / 1e6}M` : `${n / 1e3}k`}
            </button>
          ))}
        </div>
        <label className="text-ink-dim">B field (x, y, z)</label>
        <div className="grid w-72 grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <NumField key={i} value={lab.B[i]} onChange={(v) => set({ B: lab.B.map((b, j) => (j === i ? v : b)) as [number, number, number] })} />
          ))}
        </div>
        <label className="text-ink-dim">E field (x, y, z)</label>
        <div className="grid w-72 grid-cols-3 gap-1">
          {[0, 1, 2].map((i) => (
            <NumField key={i} value={lab.E[i]} onChange={(v) => set({ E: lab.E.map((b, j) => (j === i ? v : b)) as [number, number, number] })} />
          ))}
        </div>
        <label className="text-ink-dim">q / m</label>
        <div className="w-24">
          <NumField value={lab.qm} onChange={(v) => set({ qm: v })} />
        </div>
      </div>
    </div>
  )
}
