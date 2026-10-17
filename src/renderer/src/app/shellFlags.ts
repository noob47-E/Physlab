// Which pieces of the shell a student can see.
//
// This lives apart from App.tsx so that the search palette can read it without importing App, which
// imports the palette (the same cycle panels.ts exists to avoid).

/**
 * The command bar under the tool shelf. Kept in the code but hidden from students (Phase 0.9
 * C-shell cuts), together with the Console that showed its output. While it is false, nothing a
 * student reads may tell them to type a line there, and Ctrl+K must not offer a command that would
 * run with no visible place for its answer to go.
 */
export const SHOW_COMMAND_BAR = false
