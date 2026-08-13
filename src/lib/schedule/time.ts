export function crossedInstant(previous: Date, current: Date, instant: Date): boolean {
  return previous < instant && current >= instant;
}

export function crossedMinuteThreshold(previous: Date, current: Date, end: Date, threshold: number): boolean {
  const before = (end.getTime() - previous.getTime()) / 60_000;
  const now = (end.getTime() - current.getTime()) / 60_000;
  return before > threshold && now <= threshold && now > 0;
}
