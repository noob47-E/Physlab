// The Sandbox panel’s WorldSection section (moved word for word from panels/Sandbox.tsx, SB2).

import { useSandbox } from '../../sim/store'
import { GRAVITY_PRESETS, rateOf, STEP_RATES } from '../../sim/types'
import { stepRateTitle } from '../../sim/stepping'
import { useScene } from '../../core/store'
import { NumField } from '../../ui/fields'
import { Vec3Row, Fold, useNum } from './common'

/** Gravity, air and the view; the step rate and sleeping controls fold away. */
export function WorldSection() {
  const world = useSandbox((s) => s.world)
  const setWorld = useSandbox((s) => s.setWorld)
  const sideView = useSandbox((s) => s.sideView)
  const setSideView = useSandbox((s) => s.setSideView)
  const resetRun = useSandbox((s) => s.resetRun)
  const setPlaying = useScene((s) => s.setPlaying)
  const num = useNum()
  const rate = rateOf(world)
  return (
    <>
      <div className="section-title mt-2">World</div>
      <div className="prop-row">
        <label>Gravity</label>
        <div className="flex items-center gap-2">
          <select
            className="field"
            value={GRAVITY_PRESETS.find((g) => Math.abs(g.value - world.gravity) < 1e-6)?.label ?? 'Custom'}
            onChange={(e) => {
              const preset = GRAVITY_PRESETS.find((g) => g.label === e.target.value)
              if (preset) setWorld({ gravity: preset.value })
            }}
          >
            {GRAVITY_PRESETS.map((g) => (
              <option key={g.label}>{g.label}</option>
            ))}
            <option>Custom</option>
          </select>
          <NumField value={world.gravity} onChange={(gravity) => setWorld({ gravity })} />
        </div>
      </div>
      <div className="prop-row">
        <label>Air</label>
        <div className="flex items-center gap-2">
          <div className="seg">
            <button className={world.airDensity > 0 ? 'on' : ''} onClick={() => setWorld({ airDensity: 1.225 })} title="Sea level: 1.225 kg/m³">
              Air
            </button>
            <button className={world.airDensity === 0 ? 'on' : ''} onClick={() => setWorld({ airDensity: 0 })} title="No air resistance at all">
              Vacuum
            </button>
          </div>
          {world.airDensity > 0 && <span className="tabular-nums text-[color:var(--text-dim)]">{world.airDensity} kg/m³</span>}
        </div>
      </div>
      {/* Wind has been in the drag calculation from the start, with nothing to set it. */}
      {world.airDensity > 0 && <Vec3Row label="Wind" unit="m/s" value={world.wind} onChange={(wind) => setWorld({ wind })} />}
      <div className="prop-row">
        <label>View</label>
        <div className="seg">
          <button className={sideView ? 'on' : ''} onClick={() => setSideView(true)} title="Straight-on view, like a diagram in a book">
            Side view
          </button>
          <button className={!sideView ? 'on' : ''} onClick={() => setSideView(false)} title="Look around in 3D">
            3D view
          </button>
        </div>
      </div>
      <div className="prop-row">
        <label>Slow motion</label>
        <div className="seg">
          {[1, 0.5, 0.25, 0.1].map((t) => (
            <button key={t} className={world.timeScale === t ? 'on' : ''} onClick={() => setWorld({ timeScale: t })}>
              {t === 1 ? 'normal' : `×${t}`}
            </button>
          ))}
        </div>
      </div>
      <Fold id="world-more">
        <div className="prop-row">
          <label>2D mode</label>
          <input type="checkbox" checked={world.twoD} title="Hold everything in one flat plane, the way textbook problems are drawn" onChange={(e) => setWorld({ twoD: e.target.checked })} />
        </div>
        <div className="prop-row">
          <label title="A body that has stopped is allowed to fall asleep and costs nothing until something touches it">Can settle</label>
          <input type="checkbox" checked={world.allowSleeping} onChange={(e) => setWorld({ allowSleeping: e.target.checked })} />
        </div>
        <div className="prop-row">
          <label title="How many times a second the engine works the world out: more steps, a truer run, and more work for the computer">Steps a second</label>
          <div className="seg">
            {STEP_RATES.map((r) => (
              <button
                key={r}
                className={`min-h-[44px] ${rate === r ? 'on' : ''}`}
                title={stepRateTitle(r, world.gravity)}
                onClick={() => {
                  if (r === rate) return
                  // A run is one rate from t = 0: a change part-way would mix two runs in one recording.
                  // The old Accuracy figure goes with it, or a preset's leftover 8 would overrule the choice.
                  setPlaying(false)
                  setWorld({ stepRate: r, collisionSteps: undefined })
                  resetRun()
                }}
              >
                {num(r)}
              </button>
            ))}
          </div>
        </div>
      </Fold>
    </>
  )
}
