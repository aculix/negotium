/**
 * How far a row should slide, in pixels, while another row is being dragged
 * over the list.
 *
 * A lifted card vacates exactly its own height plus one gap, so every row it
 * passes travels by that same amount — `shift` — and everything else stays
 * put. The result is a real gap at the destination, which doubles as the drop
 * indicator and is therefore always accurate.
 *
 * Negative moves a row up the list, positive moves it down.
 */
export function displacement(index, fromIndex, toIndex, shift) {
  if (fromIndex === null || toIndex === null) return 0
  if (index === fromIndex) return 0

  if (fromIndex < toIndex && index > fromIndex && index <= toIndex) return -shift
  if (fromIndex > toIndex && index >= toIndex && index < fromIndex) return shift

  return 0
}
