<!-- azure gpt-5.4 (gpt-5.4-2026-03-05), effort medium -->
FAIL

**MUST**

1. **AddRow buttons are forced below the 44px touch target**
   - `src/renderer/src/panels/sandbox/AddRow.tsx:32` — `"className=\"btn h-7\""`
   - `src/renderer/src/panels/sandbox/AddRow.tsx:86` — `"className=\"btn h-7\""`
   - `src/renderer/src/panels/sandbox/AddRow.tsx:134` — `"className=\"btn h-7\""`
   - `src/renderer/src/panels/sandbox/AddRow.tsx:151` — `"className=\"btn h-7\""`
   - `src/renderer/src/panels/sandbox/AddRow.tsx:159` — `"className=\"btn h-7\""`
   - `h-7` is 28px, so this breaks the “44px+ tall on touch” rule.

2. **The 5 shapes moved into “More” lost their tool cards**
   - `src/renderer/src/panels/sandbox/AddRow.tsx:30` — `"useToolCard(\`add:${shape}\`)"`
   - `src/renderer/src/panels/sandbox/AddRow.tsx:82-95` — menu items are rendered directly with no `useToolCard(...)`
   - Contract says every shape keeps `useToolCard('add:<shape>')`; Cylinder/Capsule/Cone/Wall/Pulley no longer do.

3. **The More menu steals focus on open**
   - `src/renderer/src/panels/sandbox/AddRow.tsx:70-74` — `"(buttons[focusedIndex] as HTMLButtonElement).focus()"`
   - Contract says “no focus-stealing”.

4. **Energy leaves extra lines open instead of keeping only the bar + one total line**
   - `src/renderer/src/panels/sandbox/EnergyLedger.tsx:103-107` — `"{text.start}"`
   - `src/renderer/src/panels/sandbox/EnergyLedger.tsx:108-112` — `"{text.heat}"`
   - `src/renderer/src/panels/sandbox/EnergyLedger.tsx:114` — `"<Fold id=\"energyDetails\" open={false}"`
   - Brief says move “everything else” into `energyDetails`; these two lines are still outside the fold.

5. **WorldSection still shows a raw number instead of using the formatter**
   - `src/renderer/src/panels/sandbox/WorldSection.tsx:24` — `"const num = useNum()"`
   - `src/renderer/src/panels/sandbox/WorldSection.tsx:61` — `"{world.airDensity} kg/m³"`
   - Contract says numbers should be formatted through `useNum`.

**SHOULD / NIT**

1. **AddRow can wrap despite the brief saying the main controls should be in one row**
   - `src/renderer/src/panels/sandbox/AddRow.tsx:126` — `"flex flex-wrap"`
   - This can reintroduce clutter/layout movement on narrower widths.

2. **Menu keyboard handling is attached to `window`, not scoped to the menu**
   - `src/renderer/src/panels/sandbox/AddRow.tsx:48-66` — `"window.addEventListener('keydown', handleKeyDown)"`
   - While the menu is open, Arrow/Enter handling can keep firing even after focus moves elsewhere.

3. **Connect is still conditionally hidden during join mode**
   - `src/renderer/src/panels/sandbox/AddRow.tsx:158` — `"!joinMode && ("`
   - The brief says Connect “remains visible”; this still removes it once the flow starts.

**Unsure / not verifiable from the provided diff**
- **Line-ending mismatch** (`git diff --stat` vs `--ignore-cr-at-eol --stat`): unsure.
- **Repo-wide unused exports / deadcode**: unsure from the provided files only.
