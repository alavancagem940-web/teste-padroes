const ALLOWED_PREMATCH_STATUSES = new Set(['', 'NS', 'SCHEDULED', 'TIMED']);

export function kickoffTimeMs(match) {
  const raw = match?.kickoff || match?.commence_time || match?.utcDate || match?.date || match?.apiFixture?.date;
  const ms = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(ms) ? ms : NaN;
}

export function matchStatus(match) {
  return String(match?.apiFixture?.status || match?.status || '').trim().toUpperCase();
}

export function isPrematchEligible(match, options = {}) {
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const cutoffMinutes = Number.isFinite(Number(options.cutoffMinutes))
    ? Math.max(0, Number(options.cutoffMinutes))
    : Math.max(0, Number(process.env.PREMATCH_CUTOFF_MINUTES || 5));

  const status = matchStatus(match);
  if (!ALLOWED_PREMATCH_STATUSES.has(status)) return false;

  const kickoffMs = kickoffTimeMs(match);
  if (!Number.isFinite(kickoffMs)) return false;

  // Não gera bilhetes para partidas que já começaram nem para jogos a poucos
  // minutos do início, quando a odd pode já estar mudando para modo ao vivo.
  return kickoffMs > nowMs + cutoffMinutes * 60_000;
}

export function onlyPrematch(matches, options = {}) {
  return (matches || []).filter(match => isPrematchEligible(match, options));
}
