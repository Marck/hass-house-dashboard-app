// Hand-drawn 24x24 stroke icons. Inline SVG keeps the app free of icon fonts and network requests.
const p = (d) => `<path d="${d}"/>`;
const fill = (d) => `<path class="ic-solid" d="${d}"/>`;

const ICONS = {
  home: p('M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6'),
  bolt: p('M13 2L5 13h6l-1 9 8-12h-6z'),
  network: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/>' + p('M8.2 10.9l7.6-3.8M8.2 13.1l7.6 3.8'),
  walk: '<circle cx="13" cy="4.5" r="1.8"/>' + p('M9 21l2.5-6.5-2-2.5 1-4.5 3 1 2 3 3 1M11.5 14.5L15 17v4M10.5 7.5L7 9.5v3'),
  alert: p('M12 6v7M12 17v.5'),
  door: '<rect x="6" y="3" width="12" height="18" rx="1.5"/>' + p('M14.5 12v.5'),
  battery: '<rect x="2.5" y="8" width="17" height="8" rx="2"/>' + p('M22 11v2M6 11v2'),
  radiator: p('M6 6v12M10 6v12M14 6v12M18 6v12M3 9h18M3 15h18'),
  flame: p('M12 3c1 3 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z'),
  auto: p('M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5'),
  snow: p('M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5'),
  drop: p('M12 3c3.5 4.2 6 7.3 6 10.5a6 6 0 0 1-12 0C6 10.3 8.500 7.2 12 3z'),
  fan: '<circle cx="12" cy="12" r="1.6"/>' + p('M12 10.4C11 7 12 4 14.5 4s3 3 .5 5.2M13.600 12c3.400-1 6.400 0 6.400 2.5s-3 3-5.2.5M12 13.600c1 3.400 0 6.400-2.5 6.400s-3-3-.5-5.2M10.400 12C7 13 4 12 4 9.500s3-3 5.200-.500'),
  bulb: p('M9 18h6M10 21h4M12 3a6 6 0 0 0-3.500 10.900c.6.500 1 1.200 1 2.100h5c0-.900.400-1.600 1-2.100A6 6 0 0 0 12 3z'),
  power: p('M12 3v9M6.300 6.800a8 8 0 1 0 11.400 0'),
  close: p('M6 6l12 12M18 6L6 18'),
  shield: p('M12 3l7 3v5c0 4.500-3 8.200-7 10-4-1.800-7-5.500-7-10V6z'),
  globe: '<circle cx="12" cy="12" r="9"/>' + p('M3 12h18M12 3c2.800 3 2.800 15 0 18M12 3c-2.800 3-2.800 15 0 18'),
  uplink: p('M4 14a8 8 0 0 0 6 6zM7 17l5-5M14 4a6 6 0 0 1 6 6M14 7.500a2.500 2.500 0 0 1 2.500 2.500') + '<circle cx="13.5" cy="10.5" r="1.4"/>',
  router: '<rect x="7" y="4" width="10" height="16" rx="4"/>' + p('M10.500 9h3'),
  plug: p('M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5'),
  speaker: '<rect x="6" y="3" width="12" height="18" rx="2"/><circle cx="12" cy="14" r="3"/>' + p('M12 7v.5'),
  speakers: '<rect x="2.5" y="6" width="8.5" height="13" rx="1.8"/><rect x="13" y="6" width="8.5" height="13" rx="1.8"/><circle cx="6.75" cy="14" r="1.7"/><circle cx="17.25" cy="14" r="1.7"/>',
  ac: '<rect x="3" y="6" width="18" height="7" rx="2"/>' + p('M7 10h10M8 16v2M12 16v3M16 16v2'),
  fridge: '<rect x="6" y="3" width="12" height="18" rx="2"/>' + p('M6 10h12M9.500 6v2M9.500 13v3'),
  camera: '<rect x="3" y="7" width="13" height="10" rx="2"/>' + p('M16 11l5-3v8l-5-3'),
  sun: '<circle cx="12" cy="12" r="3.5"/>' + p('M12 3v2.500M12 18.500V21M3 12h2.500M18.500 12H21M5.600 5.600l1.800 1.800M16.600 16.600l1.800 1.800M18.400 5.600l-1.800 1.800M7.400 16.600l-1.800 1.800'),
  moon: p('M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z'),
  server: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/>' + p('M8 7.500v.5M8 16.500v.5'),
  chip: '<rect x="7" y="7" width="10" height="10" rx="2"/>' + p('M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4'),
  star: p('M12 4l2.300 4.800 5.200.700-3.800 3.600.900 5.200L12 15.800l-4.600 2.500.900-5.200-3.800-3.600 5.200-.700z'),
  bell: p('M6 16v-5a6 6 0 0 1 12 0v5l1.500 2h-15zM10 20.500h4'),
  chevron: p('M9 6l6 6-6 6'),
  play: fill('M8 5.500v13l11-6.500z'),
  pause: fill('M7 5.500h3.500v13H7zM13.500 5.500H17v13h-3.500z'),
  stop: fill('M7 7h10v10H7z'),
  prev: fill('M17 6v12l-9-6zM6 6h2v12H6z'),
  next: fill('M7 6v12l9-6zM16 6h2v12h-2z'),
  volume: p('M4 10v4h3l4 3.500v-11L7 10zM15 9.500a3.500 3.500 0 0 1 0 5'),
  bed: p('M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7M3 14h18M7 9V7h10v2M3 18v2M21 18v2'),
  bath: p('M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM6 12V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2'),
  laptop: '<rect x="5" y="5" width="14" height="10" rx="1.5"/>' + p('M3 18.500h18'),
  stairs: p('M4 19h4v-4h4v-4h4V7h4'),
  sofa: p('M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 12.500a2 2 0 0 1 4 0V15h10v-2.500a2 2 0 0 1 4 0V18H3zM6 18v2M18 18v2'),
  utensils: p('M7 3v7M5 3v4a2 2 0 0 0 4 0V3M7 10v11M16 3c-2 1.500-3 4-3 7h3zM16 10v11'),
  pot: p('M5 10h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM3 10h18M9 6.500V5M12 6.500V4M15 6.500V5'),
  washer: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="13.5" r="4"/>' + p('M8 6.500h2'),
  tree: p('M12 21v-5M12 3l5 7h-3l4 6H6l4-6H7z'),
  car: p('M4 16v-3l2-5h12l2 5v3M4 16h16M6.500 16v2M17.500 16v2M4.500 13h15'),
  music: p('M9 18V6l10-2v12') + '<circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  sunset: p('M3 18h18M7 18a5 5 0 0 1 10 0M12 5v5M9.500 7.500L12 10l2.500-2.500M5 21h14'),
  user: '<circle cx="12" cy="8.5" r="3.5"/>' + p('M5 20a7 7 0 0 1 14 0'),
  check: p('M5 12.500l4.500 4.500L19 7.500'),
  grip: fill('M9.500 8l-4.500 4 4.500 4zM14.500 8l4.500 4-4.500 4z'),
  help: '<circle cx="12" cy="12" r="9"/>' + p('M9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.700.400-1 1-1 1.700M12 16.500v.5'),
  gauge: p('M4 16a8 8 0 1 1 16 0M12 16l3.500-4.500'),
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/>' + p('M8 11V8a4 4 0 0 1 8 0v3'),
  theme: '<circle cx="12" cy="12" r="8.5"/>' + fill('M12 3.500a8.500 8.500 0 0 1 0 17z'),
  external: p('M14 5h5v5M19 5l-8 8M11 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5'),
  ring: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>',
  edit: p('M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4'),
  up: p('M6 15l6-6 6 6'),
  down: p('M6 9l6 6 6-6'),
  back: p('M15 5l-7 7 7 7'),
  trash: p('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6'),
  plus: p('M12 5v14M5 12h14'),
  // A toothed wheel, so it cannot be mistaken for the sun of the theme button.
  gear: p('M9.87 5.02L10.13 2.38L13.87 2.38L14.13 5.02L15.43 5.55L17.48 3.88L20.12 6.52L18.45 8.57L18.98 9.87L21.62 10.13L21.62 13.87L18.98 14.13L18.45 15.43L20.12 17.48L17.48 20.12L15.43 18.45L14.13 18.98L13.87 21.62L10.13 21.62L9.87 18.98L8.57 18.45L6.52 20.12L3.88 17.48L5.55 15.43L5.02 14.13L2.38 13.87L2.38 10.13L5.02 9.87L5.55 8.57L3.88 6.52L6.52 3.88L8.57 5.55Z') + '<circle cx="12" cy="12" r="3"/>',
  link: p('M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1'),
  info: '<circle cx="12" cy="12" r="9"/>' + p('M12 11v6M12 7.5v.5'),
};

export const ICON_NAMES = Object.keys(ICONS);

export function icon(name, cls = '') {
  const body = ICONS[name];
  if (!body) throw new Error(`Unknown icon: ${name}`);
  return `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Flags use fixed national colours, so they stay the same in both themes.
export const FLAGS = {
  en: '<svg class="flag" viewBox="0 0 60 40" aria-hidden="true" focusable="false"><rect width="60" height="40" fill="#012169"/><path d="M0 0l60 40M60 0L0 40" stroke="#fff" stroke-width="8"/><path d="M0 0l60 40M60 0L0 40" stroke="#c8102e" stroke-width="3"/><path d="M30 0v40M0 20h60" stroke="#fff" stroke-width="12"/><path d="M30 0v40M0 20h60" stroke="#c8102e" stroke-width="7"/></svg>',
  nl: '<svg class="flag" viewBox="0 0 60 40" aria-hidden="true" focusable="false"><rect width="60" height="40" fill="#fff"/><rect width="60" height="13.4" fill="#ae1c28"/><rect y="26.6" width="60" height="13.4" fill="#21468b"/></svg>',
};
