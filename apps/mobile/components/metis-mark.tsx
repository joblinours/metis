import Svg, { Path, Rect } from "react-native-svg";
import { useCSSVariable } from "uniwind";

export function MetisMark({ size = 48 }: { size?: number }) {
  const [tile, mark] = useCSSVariable(["--color-primary", "--color-primary-foreground"]);
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      accessibilityRole="image"
      accessibilityLabel="Metis Suite"
    >
      <Rect width="256" height="256" fill={String(tile)} />
      <Path d="M128 127.5L49.25 193.751L49.25 61.2491L128 127.5Z" fill={String(mark)} />
      <Path d="M128 127.5L206.75 61.2491V193.751L128 127.5Z" fill={String(mark)} />
    </Svg>
  );
}
