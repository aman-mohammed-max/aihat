import Svg, { Circle, Path, Rect } from 'react-native-svg';

// 1.8px stroke line icons from the design (24x24 viewBox).
const paths: Record<string, string[]> = {
  menu: ['M4 8h16M4 16h10'],
  back: ['M15 18l-6-6 6-6'],
  close: ['M6 6l12 12M18 6L6 18'],
  plus: ['M12 5v14M5 12h14'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronRight: ['M9 6l6 6-6 6'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  edit: ['M12 20h8', 'M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z'],
  search: ['M20 20l-3.5-3.5'],
  send: ['M12 19V5M5 12l7-7 7 7'],
  sliders: ['M4 7h10M18 7h2M4 17h4M12 17h8'],
  globe: ['M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18'],
  sparkle: ['M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z'],
  mic: ['M5 11a7 7 0 0014 0M12 18v3'],
  trash: ['M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'],
  settings: ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z'],
  file: ['M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z', 'M14 3v6h6'],
  image: ['M21 15l-5-5L5 21'],
  camera: ['M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z'],
  link: ['M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1', 'M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1'],
  copy: ['M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3'],
  refresh: ['M20 11a8 8 0 10-2.3 6.7', 'M20 4v7h-7'],
  speaker: ['M15 9.2a4 4 0 010 5.6M17.8 6.5a8 8 0 010 11'],
  pin: ['M12 17v5', 'M9 3h6l-1 6 4 4H6l4-4z'],
  prompt: ['M4 6h16M4 12h16M4 18h9'],
  tool: ['M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z'],
  server: ['M4 5h16v6H4zM4 13h16v6H4z', 'M8 8h.01M8 16h.01'],
  key: ['M15 7a4 4 0 11-3.9 4.9L3 20v-3l2-2h2v-2h2l2-2'],
  lock: ['M8 11V8a4 4 0 018 0v3'],
  info: ['M12 8h.01M12 11v5'],
  warn: ['M12 3l10 18H2z', 'M12 10v5M12 18h.01'],
  alert: ['M12 8v5M12 16.5v.5'],
  layout: ['M3 5h18v14H3z', 'M3 10h18M10 10v9'],
  archive: ['M4 7h16v4H4zM6 11v8h12v-8M10 15h4'],
  share: ['M12 3v12M7 8l5-5 5 5M5 21h14'],
  drive: ['M8 3h8l6 10-4 7H6l-4-7z'],
  shareBox: ['M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13'],
  branch: ['M6 7v10M18 11c0 4-6 3-12 6'],
  translate: ['M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c0 3-3 7-6 8M13 21l4-9 4 9M14.5 18h5'],
  text: ['M4 7h16M4 12h10M4 17h7'],
  // The app mark: the soft irregular polygon from the app icon, drawn solid (in `fills`).
  logo: [],
  store: ['M4 9l1.5-5h13L20 9', 'M4 9a2.5 2.5 0 005 0 2.5 2.5 0 005 0 2.5 2.5 0 005 0', 'M5 12v8h14v-8', 'M10 20v-5h4v5'],
  pause: ['M8 5v14M16 5v14'],
  play: ['M7 4l13 8-13 8z'],
  stop: ['M6 6h12v12H6z'],
  // Tablet and desktop navigation (from the responsive boards).
  sidebar: ['M6 4h12a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3z', 'M9 4v16'],
  panel: ['M6 4h12a3 3 0 013 3v10a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3z', 'M15 4v16'],
  star: ['M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z'],
  plug: ['M9 3v4M15 3v4M7 7h10v4a5 5 0 01-10 0zM12 16v5'],
  shop: ['M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9h16M9 20v-6h6v6'],
  grid: ['M4.5 3h4A1.5 1.5 0 0110 4.5v4A1.5 1.5 0 018.5 10h-4A1.5 1.5 0 013 8.5v-4A1.5 1.5 0 014.5 3z', 'M15.5 3h4A1.5 1.5 0 0121 4.5v4a1.5 1.5 0 01-1.5 1.5h-4A1.5 1.5 0 0114 8.5v-4A1.5 1.5 0 0115.5 3z', 'M4.5 14h15a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 19.5v-4A1.5 1.5 0 014.5 14z'],
  chat: ['M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z'],
  // Settings index icons (Settings board).
  contrast: [],
  stack: [],
  slashes: ['M9 4L5 20M19 4l-4 16'],
  cloud: ['M7 18a5 5 0 01-.6-10A6 6 0 0118 9a4.5 4.5 0 01-.5 9z'],
  chip: ['M9 9h6v6H9z', 'M7 5h10a2 2 0 012 2v10a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2z', 'M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3'],
  more: [],
};

const circles: Record<string, { cx: number; cy: number; r: number }[]> = {
  search: [{ cx: 11, cy: 11, r: 7 }],
  sliders: [{ cx: 16, cy: 7, r: 2 }, { cx: 10, cy: 17, r: 2 }],
  globe: [{ cx: 12, cy: 12, r: 9 }],
  info: [{ cx: 12, cy: 12, r: 9 }],
  alert: [{ cx: 12, cy: 12, r: 9 }],
  image: [{ cx: 9, cy: 9, r: 1.5 }],
  contrast: [{ cx: 12, cy: 12, r: 9 }],
  camera: [{ cx: 12, cy: 13, r: 4 }],
  branch: [{ cx: 6, cy: 5, r: 2 }, { cx: 6, cy: 19, r: 2 }, { cx: 18, cy: 9, r: 2 }],
};

const rects: Record<string, { x: number; y: number; width: number; height: number; rx: number }[]> = {
  image: [{ x: 3, y: 3, width: 18, height: 18, rx: 3 }],
  lock: [{ x: 5, y: 11, width: 14, height: 10, rx: 2 }],
  stack: [{ x: 3, y: 4, width: 18, height: 7, rx: 2 }, { x: 3, y: 13, width: 18, height: 7, rx: 2 }],
  mic: [{ x: 9, y: 3, width: 6, height: 11, rx: 3 }],
  copy: [{ x: 8, y: 8, width: 12, height: 12, rx: 2 }],
};

/** Solid shapes (drawn in the icon's colour). */
const fills: Record<string, string[]> = {
  contrast: ['M12 3a9 9 0 010 18z'],
  speaker: ['M3.5 9.5h3.2L11 6v12l-4.3-3.5H3.5z'],
  logo: ['M5.6 3.9A2.2 2.2 0 017.6 2.4L14.3 2.1A2.2 2.2 0 0116.1 2.8L21.2 8.9A2.2 2.2 0 0121.6 10.9L18.8 20A2.2 2.2 0 0116.3 21.5L9.3 20.2A2.2 2.2 0 018.2 19.8L3.1 15.4A2.2 2.2 0 012.5 13z'],
};

export type IconName = keyof typeof paths;

type Props = { name: IconName; size?: number; color: string; strokeWidth?: number };

export function Icon({ name, size = 20, color, strokeWidth = 1.8 }: Props) {
  if (name === 'more') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <Circle cx={5} cy={12} r={1.8} />
        <Circle cx={12} cy={12} r={1.8} />
        <Circle cx={19} cy={12} r={1.8} />
      </Svg>
    );
  }
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round">
      {paths[name].map((d, i) => (
        <Path key={i} d={d} />
      ))}
      {(circles[name] ?? []).map((c, i) => (
        <Circle key={i} {...c} />
      ))}
      {(rects[name] ?? []).map((r, i) => (
        <Rect key={i} {...r} />
      ))}
      {(fills[name] ?? []).map((d, i) => (
        <Path key={`f${i}`} d={d} fill={color} stroke="none" />
      ))}
    </Svg>
  );
}
