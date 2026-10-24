/**
 * Slash commands for the Nomito composer. Typing `/` opens the menu,
 * ↑↓ navigates, Enter/Tab picks. Commands either send a fixed message as
 * the Traveler (`message`) or strip the token and leave the rest of the
 * prompt as the draft (`/buscar`).
 */
export type SlashCommand = {
  key: string;
  /** shown in the menu, e.g. "/reservas" */
  name: string;
  desc: string;
  /** sent as the Traveler's message on pick; absent → fill-the-prompt command */
  message?: string;
};

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    key: 'reservas',
    name: '/reservas',
    desc: 'Ver mis reservas',
    message: 'Listame mis reservas',
  },
  {
    key: 'wallet',
    name: '/wallet',
    desc: 'Estado de mi wallet',
    message: '¿Cuál es el estado de mi wallet?',
  },
  {
    key: 'reclamo',
    name: '/reclamo',
    desc: 'Abrir un reclamo por una reserva',
    message: 'Quiero abrir un reclamo',
  },
  {
    key: 'buscar',
    name: '/buscar',
    desc: 'Buscar alojamientos — lo que sigue es la búsqueda',
  },
];

/** the last `/word` token at the end of the draft, if any (same rule as the vendored PromptBar) */
export function parseSlashToken(draft: string): { query: string; start: number } | null {
  const match = /(^|\s)\/([\w-]*)$/.exec(draft);
  if (!match) return null;
  return { query: match[2].toLowerCase(), start: match.index + match[1].length };
}

export function filterSlashCommands(query: string): SlashCommand[] {
  return SLASH_COMMANDS.filter((c) => c.name.slice(1).startsWith(query));
}
