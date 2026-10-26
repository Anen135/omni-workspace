import configuration from '../config/file-sources.json' with { type: 'json' };

// Configuration is trusted project input, never a server-provided allowlist.
export function validateFileSources(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).length !== 1 || !Array.isArray(config.sources) || !config.sources.length) throw new Error('Invalid file source configuration.');
  const hosts = new Set();
  for (const source of config.sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source) || Object.keys(source).some(key => !['host', 'pathPrefixes', 'fileId'].includes(key)) || typeof source.host !== 'string' || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/.test(source.host) || hosts.has(source.host) || source.fileId !== undefined && typeof source.fileId !== 'boolean' || !Array.isArray(source.pathPrefixes) || !source.pathPrefixes.length) throw new Error('Invalid file source configuration.');
    hosts.add(source.host);
    for (const prefix of source.pathPrefixes) {
      if (typeof prefix !== 'string' || !/^\/(?:[A-Za-z0-9_-]+\/)+$/.test(prefix) || new Set(source.pathPrefixes).size !== source.pathPrefixes.length) throw new Error('Invalid file source path prefix.');
    }
  }
  return config;
}

const { sources } = validateFileSources(configuration);

export function isFileSourceHost(hostname) {
  return sources.some(source => source.host === hostname);
}

export function allowedFileSource(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    return sources.some(source => source.host === url.hostname && source.pathPrefixes.some(prefix =>
      url.pathname.startsWith(prefix) && (!source.fileId || /^[A-Za-z0-9_-]+$/.test(url.pathname.slice(prefix.length)))));
  } catch { return false; }
}

export function fileSourcePermissions() {
  return sources.flatMap(source => source.pathPrefixes.map(prefix => `https://${source.host}${prefix}*`));
}
