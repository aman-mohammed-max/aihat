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
  file: ['M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z', 'M14 3v5h5'],
  image: ['M21 15l-5-5L5 21', 'M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2z'],
  camera: ['M3 8a2 2 0 012-2h2l2-3h6l2 3h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z'],
  link: ['M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1', 'M14 10a4 4 0 00-5.7 0l-3 3A4 4 0 0011 18.7l1-1'],
  copy: ['M9 9h10v12H9z', 'M5 15V3h10'],
  refresh: ['M20 11a8 8 0 10-2.3 6.7', 'M20 4v7h-7'],
  speaker: ['M11 5L6 9H3v6h3l5 4z', 'M16 9a4 4 0 010 6M19 6a8 8 0 010 12'],
  pin: ['M12 17v5', 'M9 3h6l-1 6 4 4H6l4-4z'],
  prompt: ['M4 6h16M4 12h16M4 18h10'],
  tool: ['M14.7 6.3a4 4 0 00-5 5L3 18l3 3 6.7-6.7a4 4 0 005-5l-2.5 2.5-2.2-2.2z'],
  server: ['M4 5h16v6H4zM4 13h16v6H4z', 'M8 8h.01M8 16h.01'],
  key: ['M15 7a4 4 0 11-3.9 4.9L3 20v-3l2-2h2v-2h2l2-2'],
  lock: ['M6 11h12v10H6z', 'M8 11V7a4 4 0 018 0v4'],
  info: ['M12 11v6M12 7.5h.01'],
  warn: ['M12 3l10 18H2z', 'M12 10v5M12 18h.01'],
  layout: ['M3 5h18v14H3z', 'M3 10h18M10 10v9'],
  // The app mark: a chat bubble with an AI spark inside.
  logo: ['M8 3.5h8A3.5 3.5 0 0119.5 7v6A3.5 3.5 0 0116 16.5h-4.5L8 20v-3.5A3.5 3.5 0 014.5 13V7A3.5 3.5 0 018 3.5z', 'M12 6.6q.45 2.9 3.4 3.4-2.95.5-3.4 3.4-.45-2.9-3.4-3.4 2.95-.5 3.4-3.4z'],
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
  more: [],
};

const circles: Record<string, { cx: number; cy: number; r: number }[]> = {
  search: [{ cx: 11, cy: 11, r: 7 }],
  sliders: [{ cx: 16, cy: 7, r: 2 }, { cx: 10, cy: 17, r: 2 }],
  globe: [{ cx: 12, cy: 12, r: 9 }],
  info: [{ cx: 12, cy: 12, r: 9 }],
  image: [{ cx: 8.5, cy: 8.5, r: 1.5 }],
  camera: [{ cx: 12, cy: 13, r: 4 }],
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
      {name === 'mic' && <Rect x={9} y={3} width={6} height={11} rx={3} />}
    </Svg>
  );
}
