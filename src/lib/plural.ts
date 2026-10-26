/** "1 Spiel" / "2 Spiele": the count followed by the matching singular or plural word. */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
