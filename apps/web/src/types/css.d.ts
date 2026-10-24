export type CssCustomProperty = `--${string}`;

declare module "react" {
  interface CSSProperties {
    [property: CssCustomProperty]: string | number | undefined;
  }
}
