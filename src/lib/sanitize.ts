/**
 * Sanitize an HTML string for safe insertion into the DOM.
 * Strips script/style/event-handler content and dangerous elements/attributes.
 * Allows basic formatting tags (p, br, strong, em, ul, ol, li, a, h1-h6).
 */
export function sanitizeHtml(dirty: string): string {
  const allowedTags = new Set([
    'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li',
    'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'hr',
  ]);
  const allowedAttributes = new Set(['href', 'target', 'rel', 'class']);

  const doc = new DOMParser().parseFromString(dirty, 'text/html');

  function cleanNode(node: Element) {
    const children = Array.from(node.children);
    for (const child of children) {
      const tag = child.tagName.toLowerCase();

      if (!allowedTags.has(tag)) {
        // Replace disallowed element with its text content (preserve text)
        const text = document.createTextNode(child.textContent || '');
        child.replaceWith(text);
        continue;
      }

      // Remove all event handler attributes and non-allowed attributes
      for (const attr of Array.from(child.attributes)) {
        if (!allowedAttributes.has(attr.name.toLowerCase())) {
          child.removeAttribute(attr.name);
        }
        // Strip javascript: URLs
        if (attr.name.toLowerCase() === 'href' && /^\s*javascript:/i.test(attr.value)) {
          child.removeAttribute(attr.name);
        }
      }

      // Force safe rel on anchor tags
      if (tag === 'a') {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer');
      }

      cleanNode(child);
    }
  }

  cleanNode(doc.body);

  return doc.body.innerHTML;
}
