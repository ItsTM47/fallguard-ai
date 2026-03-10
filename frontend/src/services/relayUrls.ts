const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

const normalizeHost = (host: string): string => {
  return host.trim().toLowerCase().replace(/^\[|\]$/g, '');
};

const isLocalHost = (host: string): boolean => {
  return LOCAL_HOSTS.has(normalizeHost(host));
};

export const resolveClientReachableUrl = (rawValue: string, fallbackPath: string): string => {
  const fallback = new URL(fallbackPath, window.location.origin).toString();
  const raw = (rawValue || '').trim();
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw, window.location.origin);
    const configIsLocal = isLocalHost(parsed.hostname);
    const appIsLocal = isLocalHost(window.location.hostname);

    // If app is opened from another machine but config still points localhost,
    // force same-origin endpoint so requests can reach the deployed relay.
    if (configIsLocal && !appIsLocal) {
      return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, window.location.origin).toString();
    }

    return parsed.toString();
  } catch {
    if (raw.startsWith('/')) return new URL(raw, window.location.origin).toString();
    return fallback;
  }
};

export const getRelayWebhookUrl = (): string => {
  return resolveClientReachableUrl(import.meta.env.VITE_LINE_WEBHOOK_URL || '', '/line-webhook');
};

export const getRelayAnalyticsUrl = (): string => {
  return resolveClientReachableUrl(import.meta.env.VITE_LLM_ANALYTICS_URL || '', '/analytics/insight');
};

export const getRelayBaseUrl = (): string => {
  try {
    const relay = new URL(getRelayWebhookUrl());
    return `${relay.protocol}//${relay.host}`;
  } catch {
    return window.location.origin;
  }
};

