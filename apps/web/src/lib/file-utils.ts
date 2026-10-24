export const TEXT_LIMIT = 20_000;

const TEXT_MIME = /^(text\/|application\/(json|xml|x-yaml|yaml|javascript))/;
const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|csv|tsv|json|ya?ml|xml|html?|css|js|ts|tsx|jsx|log|ini|conf|toml|sql|py|rb|go|rs|java|sh)$/i;

export function looksTextual(name: string, mimeType: string | null): boolean {
  if (mimeType && TEXT_MIME.test(mimeType)) return true;
  return TEXT_EXTENSIONS.test(name);
}
