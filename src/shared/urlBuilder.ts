export function buildMediaUrl(client, path) {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    if (path.startsWith('/')) {
        return (client?.API_SERVER_URL || '') + path;
    }
    return path;
}
