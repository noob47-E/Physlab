// The Sandbox panel’s Presets section (moved word for word from panels/Sandbox.tsx, SB2). SB63 split the list itself out as
// PresetList, so the simple panel's "More experiments" shows this same list rather than a second one, and every load goes
// through loadExperiment (sim/transportActions.ts): a tile, a row, Start here and a question's "Show it" take one path.

import { Beaker, ChevronDown, Play, Search } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { groupedPresets, presetBadges, PRESETS, searchPresets, startPreset } from '../../sim/presets'
import { loadExperiment } from '../../sim/transportActions'

/**
 * Experiments to start from. A blank floor with a ball on it is not a starting point for someone
 * who has never opened a physics simulator; every one of these is a question with an answer.
 */
export function Presets() {
  const [open, setOpen] = useState(false)
  const load = (id: string) => {
    loadExperiment(id)
    setOpen(false)
  }
  return (
    <div className="px-2 pb-1">
      {/* One ball, one floor, one Play button: the first thing to press, before any list. */}
      <button className="btn primary h-7 w-full justify-start" onClick={() => load(startPreset().id)} title={startPreset().about}>
        <Play size={13} /> Start here: {startPreset().label.toLowerCase()}
      </button>
      <button className="btn mt-1 h-7 w-full justify-start" onClick={() => setOpen((v) => !v)} title="Ready-made experiments" aria-expanded={open}>
        <Beaker size={13} /> Start from an experiment
        <ChevronDown size={13} className={`ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <PresetList onLoad={load} />}
    </div>
  )
}

/**
 * The full list: a search box, then every experiment under its topic. The search lives with the list, so a list closed
 * and opened again starts whole (H28): the search is done with once an experiment is picked.
 */
export function PresetList({ onLoad }: { onLoad: (id: string) => void }) {
  const [query, setQuery] = useState('')
  // One group per topic, and each row says what it joins things with, so a student looking for
  // a rope or a pulley can see where they are without opening twenty-nine experiments. The
  // badges come from building every preset, so that happens once, not on every keystroke.
  const all = useMemo(() => groupedPresets().map((g) => ({ topic: g.topic, rows: g.presets.map((p) => ({ p, badges: presetBadges(p) })) })), [])
  // A search word narrows the matches, and empty groups drop out rather than showing with nothing
  // in them; an empty query behaves exactly like the plain grouped list did before search existed.
  // The search's own tag-first order is not shown: the list stays grouped by topic on purpose,
  // so a student finds "Bouncing ball" under Energy whether they searched for it or scrolled.
  const matches = useMemo(() => new Set(searchPresets(query, PRESETS).map((p) => p.id)), [query])
  const groups = useMemo(() => all.map((g) => ({ ...g, rows: g.rows.filter((r) => matches.has(r.p.id)) })).filter((g) => g.rows.length > 0), [all, matches])
  return (
    <div className="mt-1 flex flex-col gap-1">
      {/* 44 px in px, not h-11: the root font is 13 px, so the rem height came out at 36. The
          placeholder is this field's only visible label, so it reads in --text-dim (above
          4.5:1 in every theme) rather than the fainter house placeholder colour. */}
      <div className="flex h-[44px] items-center gap-2 rounded-md border border-[color:var(--line-2)] px-2">
        <Search size={14} className="shrink-0 text-[color:var(--text-dim)]" />
        <input
          className="h-full flex-1 bg-transparent text-body outline-none placeholder:text-[color:var(--text-dim)]"
          placeholder="Search experiments — gravity, rope, spring…"
          aria-label="Search experiments"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Escape clears a search and goes no further; with nothing to clear it is not ours.
            if (e.key === 'Escape' && query) {
              e.stopPropagation()
              setQuery('')
            }
          }}
        />
      </div>
      {groups.length === 0 ? (
        <div className="px-1 py-2 text-small text-[color:var(--text-dim)]">No experiment matches that. Try gravity, spring or collision.</div>
      ) : (
        groups.map((g) => (
          <Fragment key={g.topic}>
            <div className="section-title px-1 pb-0">{g.topic}</div>
            {g.rows.map(({ p, badges }) => (
              <button key={p.id} className="rounded-md border border-[color:var(--line-2)] px-2 py-1.5 text-left hover:bg-[var(--bg-3)]" onClick={() => onLoad(p.id)} title={p.about}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-[color:var(--text-strong)]">{p.label}</span>
                  {badges.map((b) => (
                    <span key={b} className="badge text-fine text-[color:var(--text-dim)]">
                      {b === 'pulley' ? 'rope over a pulley' : b}
                    </span>
                  ))}
                </div>
                {/* Two lines here; the whole sentence is the tooltip and the panel once loaded. */}
                <div className="line-clamp-2 text-small leading-snug text-[color:var(--text-dim)]">{p.about}</div>
              </button>
            ))}
          </Fragment>
        ))
      )}
    </div>
  )
}
