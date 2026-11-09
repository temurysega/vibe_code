// При обновлении списка сохраняем позицию клавиатуры по устойчивому ключу элемента.
// Ссылки и поля можно найти по href/name; повторяющимся кнопкам нужен data-focus-key.
export function replaceKeepingFocus(root, html, { fallback } = {}) {
  if (!root?.isConnected || root.closest('[inert]')) return false;
  const active = document.activeElement;
  let selector = null;
  let index = 0;
  if (root.contains(active) && active !== root) {
    for (const attr of ['data-focus-key', 'id', 'href', 'name']) {
      if (!active.hasAttribute(attr)) continue;
      selector = `${active.tagName.toLowerCase()}[${attr}="${CSS.escape(active.getAttribute(attr))}"]`;
      index = [...root.querySelectorAll(selector)].indexOf(active);
      break;
    }
  }
  root.innerHTML = html;
  if (selector) {
    const matches = root.querySelectorAll(selector);
    let next = matches[index] || matches[0];
    if (!next || next.disabled || !next.getClientRects().length) next = fallback && root.querySelector(fallback);
    if (next && !next.disabled && next.getClientRects().length) next.focus({ preventScroll: true });
  }
  return true;
}
