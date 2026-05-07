export function escapeHtml(text: string | number | null | undefined): string {
    if (text === null || text === undefined) return '';
    const str = typeof text === 'number' ? String(text) : text;
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}
