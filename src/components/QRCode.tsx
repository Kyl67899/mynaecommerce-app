import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '@/lib/theme';

/**
 * Renders a QR code entirely on the device. The authenticator secret inside it is never sent
 * to any server or put in a URL (a remote QR image service would see the secret).
 */
export function QRCode({ value, size = 220 }: { value: string; size?: number }) {
  const { d, n } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    return { d: path, n: count };
  }, [value]);
  const quiet = 2;
  return (
    <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${n + quiet * 2} ${n + quiet * 2}`} accessibilityLabel="Authenticator QR code">
      <Rect x={-quiet} y={-quiet} width={n + quiet * 2} height={n + quiet * 2} fill={colors.white} />
      <Path d={d} fill={colors.ink} />
    </Svg>
  );
}
