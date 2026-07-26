export const themes = [
  { id: 'default', name: 'Default' },
  { id: 'claude', name: 'Claude' },
  { id: 'bumblebee', name: 'Bumblebee' },
  { id: 'emerald', name: 'Emerald' },
  { id: 'nord', name: 'Nord' },
  { id: 'sunset', name: 'Sunset' },
  { id: 'abyss', name: 'Abyss' },
  { id: 'dracula', name: 'Dracula' },
  { id: 'amethyst', name: 'Amethyst' },
  { id: 'slate', name: 'Slate' },
  { id: 'twitter', name: 'Twitter' },
  { id: 'minimal', name: 'Minimal' }
] as const;

export type ThemeId = (typeof themes)[number]['id'];

export const defaultTheme: ThemeId = 'twitter';
