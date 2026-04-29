export function normalizeMixcloudFeed(input: string): string {
  if (!input) return '/';

  const trimmed = input.trim();

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      let pathname = url.pathname;
      if (!pathname.endsWith('/')) {
        pathname += '/';
      }
      return pathname;
    } catch {
      return '/';
    }
  }

  if (trimmed.startsWith('/')) {
    return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
  }

  const withSlash = `/${trimmed}`;
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`;
}

export function buildMixcloudWidgetSrc(input: string): string {
  const feedPath = normalizeMixcloudFeed(input);
  const encoded = encodeURIComponent(feedPath);
  const src = `https://player-widget.mixcloud.com/widget/iframe/?feed=${encoded}&mini=1&hide_cover=1&light=0`;

  if (import.meta.env.DEV) {
    console.log('Mixcloud input:', input);
    console.log('Mixcloud feedPath:', feedPath);
    console.log('Mixcloud iframe src:', src);

    if (src.includes('mixcloud.comhttps')) {
      console.error('ERROR: Mixcloud URL contains duplicate domain!');
    }
    if (src.includes('%25')) {
      console.error('ERROR: Mixcloud URL is double-encoded!');
    }
  }

  return src;
}
