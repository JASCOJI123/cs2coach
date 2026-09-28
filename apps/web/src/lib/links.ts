/** Open an external URL in a new tab without giving it access to this page. */
export function openExternalLink(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}
