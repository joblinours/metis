import { rng, words } from "./rng";

const CITIES = ["Lisbon", "Pune", "Osaka", "Toronto", "Nairobi", "Lima"];
const TEAMS = ["design", "platform", "growth", "support", "finance"];

export function csvRows(count: number, delimiter: string, seed: number): string {
  const next = rng(seed);
  const lines = [["id", "name", "city", "team", "score", "joined"].join(delimiter)];
  for (let i = 1; i <= count; i++) {
    const day = String(1 + Math.floor(next() * 28)).padStart(2, "0");
    const month = String(1 + Math.floor(next() * 12)).padStart(2, "0");
    lines.push(
      [
        i,
        `Person ${i}`,
        CITIES[Math.floor(next() * CITIES.length)],
        TEAMS[Math.floor(next() * TEAMS.length)],
        Math.floor(next() * 1000),
        `2025-${month}-${day}`,
      ].join(delimiter),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function logLines(bytes: number): string {
  const lines: string[] = [];
  let size = 0;
  for (let i = 0; size < bytes; i++) {
    const line = `2026-10-08T12:${String(Math.floor(i / 60) % 60).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}Z INFO worker ${i % 8} ${words(8, i)}`;
    lines.push(line);
    size += line.length + 1;
  }
  return `${lines.join("\n")}\n`;
}

export function markdownPages(bytes: number): string {
  const sections: string[] = [];
  let size = 0;
  for (let i = 0; size < bytes; i++) {
    const section = `## Section ${i + 1}\n\n${words(60, i)}\n\n- ${words(6, i + 1)}\n- ${words(6, i + 2)}\n`;
    sections.push(section);
    size += section.length + 1;
  }
  return `# Long document\n\n${sections.join("\n")}`;
}
