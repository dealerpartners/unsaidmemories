/**
 * Fabric Design Studio — theme + preset catalogue
 *
 * Copied verbatim from the `themes`, `presets` and `themePreset()` arrays
 * in `/public/fabric-admin.html` (lines 312–324 and 405–441). Used by the
 * left sidebar's theme grid and the "add design" preset cards.
 */

export interface Theme {
  emoji: string;
  name: string;
}

export interface DesignPreset {
  title: string;
  emoji: string;
  bg: string;
  fg: string;
  text: string;
  category: string;
}

export const THEMES: Theme[] = [
  ["💐", "Mother's Day"],
  ["🎓", "School Spirit"],
  ["🥂", "Bachelor(ette) Party"],
  ["🕊️", "In Loving Memory"],
  ["💘", "Valentine's Day"],
  ["🧶", "Ugly Christmas Sweater"],
  ["🔥", "Trending Now"],
  ["🦃", "Thanksgiving"],
  ["🏳️‍🌈", "LGBTQ+"],
  ["🏡", "Family"],
  ["😂", "Funny"],
  ["🩺", "Professions"],
  ["🇺🇸", "Patriotism"],
  ["🏀", "Sports"],
  ["💚", "Causes & Awareness"],
  ["☀️", "Positive Vibes"],
  ["✝️", "Faith & Spirituality"],
  ["🎸", "Hobbies"],
  ["❄️", "Winter Holidays"],
  ["🎉", "Life Events"],
  ["🔤", "Typography"],
  ["📍", "Places"],
  ["🌿", "Nature"],
  ["📼", "Vintage"],
  ["🦇", "Gothic"],
  ["🐾", "Pets"],
  ["🎬", "Pop Culture"],
  ["☕", "Food & Drink"],
  ["🦋", "Animals"],
  ["🎨", "Cartoons"],
  ["🌀", "Abstract"],
  ["👾", "Characters"],
  ["🎃", "Halloween"],
].map(([emoji, name]) => ({ emoji, name })) as Theme[];

export const DESIGN_PRESETS: DesignPreset[] = [
  { title: "Good vibes", emoji: "✺", bg: "#f6edff", fg: "#7258e8", text: "GOOD VIBES", category: "Positive Vibes" },
  { title: "Wildflower", emoji: "✿", bg: "#f9efe5", fg: "#b46c45", text: "WILD FLOWER", category: "Nature" },
  { title: "Retro smile", emoji: "☻", bg: "#ffedcb", fg: "#d95d39", text: "STAY GROOVY", category: "Vintage" },
  { title: "Love club", emoji: "♥", bg: "#ffe9ee", fg: "#e45173", text: "LOVE CLUB", category: "Valentine's Day" },
  { title: "Mountain life", emoji: "▲", bg: "#e4f0e9", fg: "#356b56", text: "OUTSIDE MORE", category: "Nature" },
  { title: "Lucky charm", emoji: "☘", bg: "#e4f5e8", fg: "#208251", text: "FEELING LUCKY", category: "Positive Vibes" },
  { title: "Spooky season", emoji: "☠", bg: "#292432", fg: "#ff9c4a", text: "SPOOKY", category: "Halloween" },
  { title: "Weekend mode", emoji: "☼", bg: "#e5efff", fg: "#315dba", text: "WEEKEND MODE", category: "Funny" },
];

/**
 * Theme → preset map. Copied verbatim from `themePreset()` in the
 * prototype. Returns a fallback preset for unknown themes.
 */
const THEME_PRESET_MAP: Record<string, DesignPreset> = {
  "Mother's Day": { title: "Made with love", emoji: "💐", bg: "#fff0f3", fg: "#c44d70", text: "MADE WITH LOVE", category: "Mother's Day" },
  "School Spirit": { title: "School spirit", emoji: "🎓", bg: "#e8edff", fg: "#344f9c", text: "SCHOOL SPIRIT", category: "School Spirit" },
  "Bachelor(ette) Party": { title: "Party mode", emoji: "🥂", bg: "#f9e7f0", fg: "#a83b73", text: "PARTY MODE", category: "Bachelor(ette) Party" },
  "In Loving Memory": { title: "Forever in heart", emoji: "🕊️", bg: "#f0eef4", fg: "#615b72", text: "FOREVER IN OUR HEARTS", category: "In Loving Memory" },
  "Valentine's Day": { title: "Love club", emoji: "♥", bg: "#ffe9ee", fg: "#e45173", text: "LOVE CLUB", category: "Valentine's Day" },
  "Ugly Christmas Sweater": { title: "Merry & bright", emoji: "🎄", bg: "#e6f4e9", fg: "#24724a", text: "MERRY & BRIGHT", category: "Ugly Christmas Sweater" },
  "Trending Now": { title: "Trending now", emoji: "✦", bg: "#eeeaff", fg: "#7258e8", text: "TRENDING NOW", category: "Trending Now" },
  "Thanksgiving": { title: "Gather together", emoji: "🍂", bg: "#fae9d7", fg: "#a4542f", text: "GATHER TOGETHER", category: "Thanksgiving" },
  "LGBTQ+": { title: "Love is love", emoji: "🏳️‍🌈", bg: "#fff0f3", fg: "#9d3d85", text: "LOVE IS LOVE", category: "LGBTQ+" },
  "Family": { title: "Family first", emoji: "🏡", bg: "#e8f4eb", fg: "#397552", text: "FAMILY FIRST", category: "Family" },
  "Funny": { title: "Good humor", emoji: "😂", bg: "#fff0cb", fg: "#bb5a25", text: "I'M HERE FOR THE SNACKS", category: "Funny" },
  "Professions": { title: "Proud professional", emoji: "✦", bg: "#e8effa", fg: "#315a8a", text: "PROUD PROFESSIONAL", category: "Professions" },
  "Patriotism": { title: "Land of the free", emoji: "★", bg: "#fce9e9", fg: "#a93845", text: "LAND OF THE FREE", category: "Patriotism" },
  "Sports": { title: "Game day", emoji: "🏆", bg: "#e7f4e9", fg: "#26764c", text: "GAME DAY", category: "Sports" },
  "Causes & Awareness": { title: "Make a difference", emoji: "♡", bg: "#e9f2ff", fg: "#3568a8", text: "MAKE A DIFFERENCE", category: "Causes & Awareness" },
  "Positive Vibes": { title: "Good vibes", emoji: "✺", bg: "#f6edff", fg: "#7258e8", text: "GOOD VIBES", category: "Positive Vibes" },
  "Faith & Spirituality": { title: "Walk in faith", emoji: "✧", bg: "#f1edff", fg: "#6650a5", text: "WALK IN FAITH", category: "Faith & Spirituality" },
  "Hobbies": { title: "Made for this", emoji: "🎸", bg: "#ffefd9", fg: "#a65d2d", text: "MADE FOR THIS", category: "Hobbies" },
  "Winter Holidays": { title: "Winter magic", emoji: "❄", bg: "#e7f2fb", fg: "#386b9d", text: "WINTER MAGIC", category: "Winter Holidays" },
  "Life Events": { title: "The best is yet", emoji: "🎉", bg: "#f9e8f0", fg: "#a84678", text: "THE BEST IS YET TO COME", category: "Life Events" },
  "Typography": { title: "Type study", emoji: "Aa", bg: "#f0eff5", fg: "#262633", text: "TYPE STUDY", category: "Typography" },
  "Places": { title: "Adventure awaits", emoji: "⌖", bg: "#e7f2e9", fg: "#397654", text: "ADVENTURE AWAITS", category: "Places" },
  "Nature": { title: "Wildflower", emoji: "✿", bg: "#f9efe5", fg: "#b46c45", text: "WILD FLOWER", category: "Nature" },
  "Vintage": { title: "Stay groovy", emoji: "☻", bg: "#ffedcb", fg: "#d95d39", text: "STAY GROOVY", category: "Vintage" },
  "Gothic": { title: "Midnight", emoji: "☾", bg: "#292432", fg: "#e7d5f5", text: "MIDNIGHT", category: "Gothic" },
  "Pets": { title: "Paw prints", emoji: "🐾", bg: "#f9efe5", fg: "#8a6044", text: "PAW PRINTS", category: "Pets" },
  "Pop Culture": { title: "Fan club", emoji: "★", bg: "#eeeaff", fg: "#7258e8", text: "FAN CLUB", category: "Pop Culture" },
  "Food & Drink": { title: "Coffee club", emoji: "☕", bg: "#f4e6d8", fg: "#865539", text: "COFFEE CLUB", category: "Food & Drink" },
  "Animals": { title: "Wild at heart", emoji: "🦋", bg: "#e6f4f0", fg: "#267c72", text: "WILD AT HEART", category: "Animals" },
  "Cartoons": { title: "Play mode", emoji: "✹", bg: "#fff0cb", fg: "#d05b3d", text: "PLAY MODE", category: "Cartoons" },
  "Abstract": { title: "Shape language", emoji: "◈", bg: "#ece9ff", fg: "#6b58cf", text: "SHAPE LANGUAGE", category: "Abstract" },
  "Characters": { title: "Main character", emoji: "✦", bg: "#f9e5ef", fg: "#aa427a", text: "MAIN CHARACTER", category: "Characters" },
  "Halloween": { title: "Spooky season", emoji: "☠", bg: "#292432", fg: "#ff9c4a", text: "SPOOKY", category: "Halloween" },
};

export function themePreset(name: string): DesignPreset {
  return (
    THEME_PRESET_MAP[name] ?? {
      title: name,
      emoji: "✦",
      bg: "#eeeaff",
      fg: "#7258e8",
      text: name.toUpperCase(),
      category: name,
    }
  );
}

export const AI_STYLE_OPTIONS = [
  "Retro and playful",
  "Minimal and modern",
  "Bold typography",
  "Soft and hand-drawn",
] as const;

export type AiStyle = (typeof AI_STYLE_OPTIONS)[number];
