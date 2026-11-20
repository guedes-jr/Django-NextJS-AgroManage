import Svg, { Path, Rect, Circle } from 'react-native-svg';
export type HomeIconName = 'home' | 'agenda' | 'modules' | 'plus' | 'search' | 'bell' | 'wallet' | 'trend' | 'leaf' | 'box' | 'arrow' | 'chart' | 'back' | 'pig' | 'heart' | 'baby' | 'group';
export function HomeIcon({ name, color = '#17602F', size = 22 }: { name: HomeIconName; color?: string; size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden={true}>
    {name === 'home' && <Path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z" />}
    {name === 'agenda' && <><Rect x={3} y={5} width={18} height={16} rx={3}/><Path d="M7 3v5m10-5v5M3 11h18m-14 4h3m4 0h3m-10 3h3"/></>}
    {name === 'modules' && <>{[3,14].flatMap(x => [3,14].map(y => <Rect key={`${x}-${y}`} x={x} y={y} width={7} height={7} rx={2}/>))}</>}
    {name === 'plus' && <Path d="M12 4v16M4 12h16"/>}
    {name === 'search' && <><Circle cx={10} cy={10} r={7}/><Path d="m15 15 6 6"/></>}
    {name === 'bell' && <Path d="M5 10a7 7 0 0 1 14 0v6l2 2H3l2-2Zm5 11h4"/>}
    {name === 'wallet' && <><Rect x={3} y={5} width={18} height={15} rx={3}/><Path d="M3 9h18m-5 4h5v4h-5Z"/></>}
    {name === 'chart' && <><Rect x={3} y={13} width={4} height={8} rx={1.5}/><Rect x={10} y={8} width={4} height={13} rx={1.5}/><Rect x={17} y={3} width={4} height={18} rx={1.5}/></>}
    {name === 'trend' && <Path d="m3 18 7-8 4 4 7-10m-7 0h7v7"/>}
    {name === 'leaf' && <Path d="M12 21V11m0 5C3 17 2 12 3 7c6-1 10 2 9 9Zm0-5C11 4 16 2 22 3c0 6-3 10-10 8Zm-5 0 5 5m0-5 5-4"/>}
    {name === 'box' && <Path d="m3 7 9-5 9 5v10l-9 5-9-5Zm0 0 9 5 9-5M12 12v10M7 4l10 6"/>}
    {name === 'arrow' && <Path d="m9 5 7 7-7 7"/>}
    {name === 'back' && <Path d="m15 18-6-6 6-6"/>}
    {name === 'pig' && <><Path d="M5 10V8l3 1 2-3h5l2 3 3-1v3l-2 2v4a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-4Z"/><Circle cx={16} cy={12} r={.8} fill={color}/><Path d="M8 20v2m7-2v2M4 12H2m18 0h2"/></>}
    {name === 'heart' && <Path d="M20.8 4.8a5.4 5.4 0 0 0-7.6 0L12 6l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6L12 21l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z"/>}
    {name === 'baby' && <><Circle cx={12} cy={8} r={3.5}/><Path d="M5 21c.7-4.2 3-6.2 7-6.2s6.3 2 7 6.2M9 4c.6-1.3 1.6-2 3-2 1.4 0 2.4.7 3 2"/></>}
    {name === 'group' && <><Circle cx={9} cy={8} r={3}/><Circle cx={17} cy={10} r={2.4}/><Path d="M3 21c.4-4.1 2.5-6.2 6-6.2s5.6 2.1 6 6.2m-1.4-4.9c3 .1 4.8 1.8 5.1 4.9"/></>}
  </Svg>;
}
