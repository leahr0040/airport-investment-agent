import type { ExpansionScore } from '@/domain/scoring/expansionScore';

// Deterministic on purpose: every number here traces straight to scoreAirports's
// output, with no LLM in the loop to paraphrase (and possibly invent) a figure.
export function formatNarrative(scores: ExpansionScore[], query: string): string {
  if (scores.length === 0) {
    return `I couldn't find scoring data for "${query}".`;
  }

  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const lines = [`For "${query}", here's how these airports compare on expansion opportunity:`, ''];

  ranked.forEach((entry, rank) => {
    lines.push(`${rank + 1}. ${entry.icao} — score ${entry.score.toFixed(1)}/100 (${entry.components.coverage}).`);
  });

  if (ranked.length > 1) {
    const [top, ...rest] = ranked;
    lines.push('', `${top.icao} ranks highest at ${top.score.toFixed(1)}, ahead of ${rest.map((airport) => airport.icao).join(', ')}.`);
  }

  return lines.join('\n');
}
