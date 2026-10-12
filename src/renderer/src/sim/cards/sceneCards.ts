// Cards for particular experiments (the bounce, the Atwood machine, the terminal speed …), one
// CardSpec row each, written the way catalogue.ts writes the core cards. SB40 fills this list;
// index.ts merges it with the core cards and refuses an id that is already taken.

import type { CardSpec } from './types'

export const SCENE_CARDS: CardSpec[] = []
