declare module "addressparser" {
  interface ParsedAddress {
    name: string;
    address?: string;
    group?: ParsedAddress[];
  }
  function addressparser(input: string): ParsedAddress[];
  export = addressparser;
}

declare module "libmime" {
  const libmime: {
    decodeWords(value: string): string;
  };
  export = libmime;
}
