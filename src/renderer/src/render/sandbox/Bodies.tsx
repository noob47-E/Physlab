// The Sandbox's bodies: one mesh each, matched to the engine by userData.bodyId, and its material.

import { useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { useSandbox } from '../../sim/store'
import { materialFinish } from '../../sim/materials'
import { drawnColour } from '../../sim/palette'
import { themeColor, useTheme, useThemed } from '../../app/theme'
import { bodyGeometry } from '../sandboxMeshes'
import { apparatusGeometry, getMetreRuleTexture, isMetreRule } from './apparatusLooks'
import { useReleaseLater } from '../releaseLater'

/**
 * Every body's mesh. A fragment, not a group: the meshes stay direct children of SandboxView's group, where
 * grab-and-throw picks them and applyTransforms places them.
 */
export function Bodies() {
  const bodies = useSandbox((s) => s.bodies)
  const selection = useSandbox((s) => s.selection)
  const partner = useSandbox((s) => s.partner)
  const selectColour = useThemed(() => themeColor('--sel-glow'))

  const meshes = useMemo(() => {
    const geos = bodies.map((def) => apparatusGeometry(def) ?? bodyGeometry(def))
    return { geos }
  }, [bodies])
  useReleaseLater(meshes, (m) => m.geos.forEach((g) => g.dispose()))

  // The colour each body is drawn in under this theme (a palette token read off the stylesheet,
  // or the student's own colour), and how its material takes the light. The key carries both and
  // the theme: WebGPU compiles a material's colour in, so a new colour needs a new material.
  const theme = useTheme((t) => t.theme)
  const looks = useMemo(
    () =>
      bodies.map((d) => {
        const isRule = isMetreRule(d)
        const isVert = d.size[1] > d.size[0]
        const map = isRule ? getMetreRuleTexture(isVert ? 'vertical' : 'beam') : null
        const colour = isRule ? new THREE.Color(1, 1, 1) : drawnColour(d.color, themeColor)
        const finish = materialFinish(d.material)
        return {
          colour,
          map,
          specular: new THREE.Color().setScalar(finish.shine),
          gloss: finish.gloss,
          key: `${theme}|${isRule ? 'rule' : colour}|${finish.shine}|${finish.gloss}`
        }
      }),
    [bodies, theme]
  )

  return (
    <>
      {bodies.map((def, i) => (
        <mesh key={def.id} geometry={meshes.geos[i]} userData={{ bodyId: def.id }}>
          {/* A gold tint at a third strength was all but invisible on steel, concrete and lead —
              the three darkest materials and the three most used. The selected object is lit
              properly instead, so you can tell at a glance which one the panel is describing.
              The geometry's own tint (outline, a ball's band, a wheel's groove) multiplies the
              colour, and the material's finish sets the highlight. */}
          <meshPhongMaterial
            key={`${selectColour}|${looks[i].key}`}
            vertexColors={!looks[i].map}
            map={looks[i].map ?? undefined}
            color={looks[i].colour}
            specular={looks[i].specular}
            shininess={looks[i].gloss}
            emissive={selectColour}
            emissiveIntensity={selection === def.id ? 0.95 : partner === def.id ? 0.45 : 0}
          />
        </mesh>
      ))}
    </>
  )
}

