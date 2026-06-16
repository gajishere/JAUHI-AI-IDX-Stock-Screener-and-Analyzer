import { Pill } from './report';

// Marks a surface whose data is fetched live from the IDX (RapidAPI) API. Reuse
// this anywhere IDX-sourced data is shown so the provenance label stays
// consistent. "IDX API" is a proper noun and intentionally not translated; the
// optional session date is passed through as data.
export function IdxBadge({ date }) {
  return <Pill tone="info">{date ? `IDX API · ${date}` : 'IDX API'}</Pill>;
}
