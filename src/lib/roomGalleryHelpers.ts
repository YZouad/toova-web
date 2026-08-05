export function roomHotScore(input: {
  likes: number;
  forks: number;
  views: number;
  publishedAt: Date | string;
  now?: Date;
}): number {
  const published =
    typeof input.publishedAt === 'string'
      ? new Date(input.publishedAt)
      : input.publishedAt;
  const now = input.now ?? new Date();
  const ageDays =
    Math.max(0, (now.getTime() - published.getTime()) / 86400000) + 2;
  const raw = input.likes * 4 + input.forks * 3 + input.views * 0.1;
  return raw / Math.pow(Math.max(1, ageDays), 1.2);
}
