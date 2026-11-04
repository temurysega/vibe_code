// Вход по логину и паролю. В демо-режиме под формой — тестовые учётные записи для жюри.
// Настоящие логины и пароли МГИМО здесь не принимаются: сервер знает только демо-аккаунты.
import { get, post, setCsrf } from '../lib/api.js';
import { session } from '../lib/bus.js';
import { esc } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { logoMark, wordmark } from '../art/logo.js';
import { svg as avatarSvg, pet, backdrop } from '../art/avatar.js';

// Персонажи обложки — не связаны с учётными записями
const CROWD = [
  ['', { body: 'f', skin: 's2', hair: 'long', hairColor: 'brown', eyes: 'lashes', mouth: 'smile', cheeks: 'blush', top: 'blazer', topColor: 'navy', bottom: 'skirt', bottomColor: 'graphite', shoes: 'loafers', shoesColor: 'black', extra: 'scarf', extraColor: 'gold' }],
  ['big', { body: 'm', skin: 's3', hair: 'short', hairColor: 'black', eyes: 'round', mouth: 'grin', top: 'mgimo-hoodie', bottom: 'jeans', bottomColor: 'denim', shoes: 'sneakers', shoesColor: 'navy', hat: 'mortarboard' }],
  ['', { body: 'f', skin: 's1', hair: 'bob', hairColor: 'ginger', eyes: 'round', mouth: 'smirk', cheeks: 'freckles', top: 'turtleneck', topColor: 'cream', bottom: 'trousers', bottomColor: 'navy', shoes: 'boots', shoesColor: 'black', glasses: 'round' }],
  ['far', { body: 'm', skin: 's5', hair: 'curly', hairColor: 'black', eyes: 'happy', mouth: 'smile', top: 'mun-bomber', bottom: 'trousers', bottomColor: 'beige', shoes: 'sneakers', shoesColor: 'gray' }],
];

