export type Tier = 'low' | 'medium' | 'high'
export type Pattern = 'plain' | 'woodRings' | 'brushed' | 'speckle' | 'mottled' | 'frost' | 'granules'

export interface MaterialLook {
  base: string
  tint2: string
  roughness: number
  metalness: number
  clearcoat: number
  transmission: number
  opacity: number
  pattern: Pattern
  scale: number
  strength: number
}

export const MATERIAL_LOOKS: Record<string, MaterialLook> = {
  steel: { base: '#adb5bd', tint2: '#8d959e', roughness: 0.35, metalness: 1, clearcoat: 0, transmission: 0, opacity: 1, pattern: 'brushed', scale: 0.004, strength: 0.35 },
  aluminium: { base: '#ced4da', tint2: '#b9c0c7', roughness: 0.3, metalness: 1, clearcoat: 0, transmission: 0, opacity: 1, pattern: 'brushed', scale: 0.004, strength: 0.25 },
  wood: { base: '#c98a45', tint2: '#9c6430', roughness: 0.6, metalness: 0, clearcoat: 0, transmission: 0, opacity: 1, pattern: 'woodRings', scale: 0.02, strength: 0.6 },
  rubber: { base: '#495057', tint2: '#3a3f45', roughness: 0.9, metalness: 0, clearcoat: 0, transmission: 0, opacity: 1, pattern: 'speckle', scale: 0.003, strength: 0.3 },
  glass: { base: '#74c0fc', tint2: '#a5d8ff', roughness: 0.05, metalness: 0, clearcoat: 0, transmission: 0.9, opacity: 0.35, pattern: 'plain', scale: 1, strength: 0 },
  concrete: { base: '#868e96', tint2: '#6f777f', roughness: 0.95, metalness: 0, clearcoat: 0, transmission: 0, opacity: 1, pattern: 'mottled', scale: 0.15, strength: 0.5 },
  ice: { base: '#a5d8ff', tint2: '#e7f5ff', roughness: 0.08, metalness: 0, clearcoat: 1, transmission: 0.4, opacity: 0.85, pattern: 'frost', scale: 0.05, strength: 0.3 },
  plastic: { base: '#ffd43b', tint2: '#f5c518', roughness: 0.4, metalness: 0, clearcoat: 0.6, transmission: 0, opacity: 1, pattern: 'plain', scale: 1, strength: 0 },
  cork: { base: '#e8c39e', tint2: '#c49a6c', roughness: 0.85, metalness: 0, clearcoat: 0, transmission: 0, opacity: 1, pattern: 'granules', scale: 0.004, strength: 0.6 },
  lead: { base: '#5c6670', tint2: '#4d565f', roughness: 0.6, metalness: 0.6, clearcoat: 0, transmission: 0, opacity: 1, pattern: 'mottled', scale: 0.05, strength: 0.2 },
  foam: { base: '#ffa8a8', tint2: '#ff9090', roughness: 1, metalness: 0, clearcoat: 0, transmission: 0, opacity: 1, pattern: 'speckle', scale: 0.006, strength: 0.2 }
}

export function lookFor(materialId: string, tier: Tier): MaterialLook {
  const row = MATERIAL_LOOKS[materialId] ?? MATERIAL_LOOKS['steel']

  if (tier === 'low') {
    return {
      ...row,
      pattern: 'plain',
      strength: 0,
      clearcoat: 0,
      transmission: 0
    }
  }

  if (tier === 'medium') {
    return {
      ...row,
      clearcoat: 0,
      transmission: 0
    }
  }

  return row
}
