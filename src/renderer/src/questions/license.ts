// The licence gate. PhysLab may bundle a question only under CC BY 4.0, CC BY-SA 4.0 or CC0 1.0;
// anything else — NonCommercial, NoDerivatives, "All rights reserved", nothing said — is refused
// with one plain sentence that quotes what was found. Headless: no React, no store, no DOM.

import { LICENSE_IDS, type License, type LicenseId } from './pqjson'

/**
 * The exact `metadata.licence` strings Numbas writes for the two licences in the pool. Exact
 * means exact: no case folding and no substring match, because "Creative Commons
 * Attribution-NonCommercial-ShareAlike 4.0 International" contains the CC BY string and must
 * still be refused.
 */
export const NUMBAS_LICENCE_STRINGS: Record<string, LicenseId> = {
  'Creative Commons Attribution 4.0 International': 'CC BY 4.0',
  'Creative Commons Attribution-ShareAlike 4.0 International': 'CC BY-SA 4.0'
}

/** The licence id for a Numbas licence string, or null for anything that is not exactly one of the two. */
export function licenseFromNumbas(found: string | null | undefined): LicenseId | null {
  if (typeof found !== 'string') return null
  // Outer whitespace only: a trailing newline from a file is not a different licence, a
  // trailing period or a different word is.
  const key = found.trim()
  return Object.prototype.hasOwnProperty.call(NUMBAS_LICENCE_STRINGS, key) ? NUMBAS_LICENCE_STRINGS[key] : null
}

/**
 * True when the licence is one PhysLab may ship under. CC BY and CC BY-SA require attribution,
 * so they need someone to attribute; CC0 waives every right, so an empty holder is allowed there.
 */
export function isShippable(l: License | undefined): l is License {
  if (l === undefined || l === null || typeof l !== 'object') return false
  if (typeof l.id !== 'string' || !(LICENSE_IDS as readonly string[]).includes(l.id)) return false
  if (typeof l.holder !== 'string') return false
  return l.id === 'CC0 1.0' || l.holder.trim() !== ''
}

/** What Numbas writes when the author picked nothing. */
const NONE_SPECIFIED = 'None specified'

/** The one sentence the import report shows for a refused question; it quotes what was found. */
export function refusalSentence(title: string, found: string | null | undefined): string {
  const text = typeof found === 'string' ? found.trim() : ''
  if (text === '' || text === NONE_SPECIFIED) return `Question '${title}' names no licence, which PhysLab may not bundle.`
  return `Question '${title}' is licensed '${text}', which PhysLab may not bundle.`
}

/** One short paragraph per licence for the NOTICE file that ships with the question bank. */
export const POOL_NOTICE_TEXT: Record<LicenseId, string> = {
  'CC BY 4.0':
    'Questions marked CC BY 4.0 are used under the Creative Commons Attribution 4.0 International licence. ' +
    'Each names its author or source, who is credited here; the questions may be shared and adapted, ' +
    'with that credit kept, under the same or any other terms. Licence text: https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 4.0':
    'Questions marked CC BY-SA 4.0 are used under the Creative Commons Attribution-ShareAlike 4.0 International licence. ' +
    'Each names its author or source, who is credited here; an adapted version of such a question must carry the same ' +
    'licence. CC BY-SA 4.0 is one-way compatible with the GNU GPL version 3: a BY-SA question may be relicensed under ' +
    'GPLv3, but GPLv3 material may not come back under BY-SA. Licence text: https://creativecommons.org/licenses/by-sa/4.0/',
  'CC0 1.0':
    'Questions marked CC0 1.0 have been placed in the public domain by their authors under the Creative Commons CC0 1.0 ' +
    'Universal dedication. They may be used for any purpose without credit, though PhysLab names the source where one is ' +
    'known. Licence text: https://creativecommons.org/publicdomain/zero/1.0/'
}
