// Собственный знак концепта «МГИМО Мания»: «М» из меридианов глобуса и путеводная звезда.
// Перекликается с идеей международного вуза, но не повторяет официальный логотип МГИМО.
export function logoMark(cls = 'logo-mark') {
  return `<svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="9" fill="#0F2D69"/>
    <circle cx="16" cy="16.5" r="10" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.4"/>
    <path d="M16 6.5 V26.5" stroke="#fff" stroke-opacity=".16" stroke-width="1.2"/>
    <path d="M10.4 22.6 C9.2 18.4 9.4 14.2 11.2 11.2 L16 17.8 L20.8 11.2 C22.6 14.2 22.8 18.4 21.6 22.6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M24.6 4.6 l.9 1.9 2.1 .3 -1.5 1.5 .4 2.1 -1.9 -1 -1.9 1 .4 -2.1 -1.5 -1.5 2.1 -.3 Z" fill="#C9A646"/>
  </svg>`;
}

export function wordmark(tag = true) {
  return `<span class="logo-word"><b>мгимо</b><i>мания</i>${tag ? '<span class="logo-tag">концепт кабинета студента</span>' : ''}</span>`;
}

export const APP_NAME = 'МГИМО Мания';
