// Общий каталог игрового слоя: внешность, вещи, зоны кампуса, титулы и правила.
// Один и тот же модуль импортируют браузер (витрины) и сервер (проверка, что вещь открыта).

// Внешность — всё бесплатно
export const APPEARANCE = {
  body: [['m', 'Мужская'], ['f', 'Женская']],
  skin: [['s1', '#FDE4D3'], ['s2', '#F5C9A6'], ['s3', '#E0A77C'], ['s4', '#C2885C'], ['s5', '#97603C'], ['s6', '#68412A']],
  hair: [['short', 'Короткая'], ['side', 'Набок'], ['buzz', 'Ёжик'], ['curly', 'Кудри'], ['afro', 'Афро'], ['bob', 'Каре'], ['long', 'Длинные'], ['bun', 'Пучок'], ['ponytail', 'Хвост'], ['none', 'Без волос']],
  hairColor: [['black', 'Чёрный'], ['dark', 'Тёмный'], ['brown', 'Каштан'], ['light', 'Русый'], ['blonde', 'Блонд'], ['ginger', 'Рыжий'], ['gray', 'Седой'], ['navy', 'Синий'], ['violet', 'Фиолетовый'], ['pink', 'Розовый']],
  eyes: [['round', 'Обычные'], ['big', 'Большие'], ['happy', 'Улыбка'], ['wink', 'Подмигивание'], ['sleepy', 'Спокойные'], ['lashes', 'Ресницы']],
  mouth: [['smile', 'Улыбка'], ['grin', 'Смех'], ['open', 'Удивление'], ['calm', 'Спокойствие'], ['smirk', 'Ухмылка']],
  cheeks: [['none', 'Нет'], ['blush', 'Румянец'], ['freckles', 'Веснушки']],
  facial: [['none', 'Нет'], ['stubble', 'Щетина'], ['mustache', 'Усы'], ['beard', 'Борода']],
};

// Цвета одежды, которые можно выбрать
export const COLORS = ['white', 'cream', 'graphite', 'gray', 'black', 'navy', 'royal', 'sky', 'gold', 'violet', 'lilac', 'mint', 'coral', 'sand', 'denim', 'lightdenim', 'beige', 'olive', 'pink', 'red', 'brown', 'orange'];

// src: base — бесплатно; digital — за М-коины; kit — мерч из Лавки с цифровой копией;
// route/routeAll — за прогулку по кампусу; game — за рекорд забега; focus — за фокус-сессии;
// steps — за «Первые шаги»; grade — за сессию без троек. Знаки за учёбу не продаются.
const I = (id, slot, name, src, more) => Object.assign({ id, slot, name, src }, more || {});
export const ITEMS = [
  I('tee', 'top', 'Футболка', 'base', { colors: ['white', 'navy', 'sky', 'graphite', 'coral', 'mint', 'gold'] }),
  I('polo', 'top', 'Поло', 'base', { colors: ['navy', 'white', 'violet', 'mint', 'sand'] }),
  I('shirt', 'top', 'Рубашка', 'base', { colors: ['white', 'sky', 'cream', 'pink', 'mint'] }),
  I('hoodie', 'top', 'Худи', 'base', { colors: ['graphite', 'navy', 'violet', 'sky', 'sand', 'coral'] }),
  I('sweater', 'top', 'Свитер', 'base', { colors: ['cream', 'navy', 'olive', 'lilac', 'red'] }),
  I('turtleneck', 'top', 'Водолазка', 'base', { colors: ['graphite', 'cream', 'navy', 'sand'] }),
  I('blazer', 'top', 'Пиджак', 'base', { colors: ['navy', 'graphite', 'sand', 'violet'] }),
  I('mun-bomber', 'top', 'Бомбер «Модель ООН»', 'digital', { price: 900 }),
  I('ling-knit', 'top', 'Свитер «Полиглот»', 'digital', { price: 700 }),
  I('mgimo-tee', 'top', 'Футболка МГИМО', 'kit', { kit: 'kit-tee' }),
  I('mgimo-hoodie', 'top', 'Худи МГИМО', 'kit', { kit: 'kit-hoodie' }),
  I('focus-jacket', 'top', 'Куртка «В фокусе»', 'focus', { need: 5 }),
  I('gown', 'top', 'Мантия «Отличник»', 'grade', { how: 'Сессия без троек и долгов' }),

  I('jeans', 'bottom', 'Джинсы', 'base', { colors: ['denim', 'black', 'lightdenim'] }),
  I('trousers', 'bottom', 'Брюки', 'base', { colors: ['graphite', 'beige', 'navy', 'olive'] }),
  I('joggers', 'bottom', 'Джоггеры', 'base', { colors: ['graphite', 'navy', 'violet', 'gray'] }),
  I('shorts', 'bottom', 'Шорты', 'base', { colors: ['sand', 'denim', 'graphite'] }),
  I('skirt', 'bottom', 'Юбка', 'base', { colors: ['graphite', 'navy', 'beige', 'violet', 'red'] }),
  I('cargo', 'bottom', 'Карго', 'digital', { price: 400, colors: ['olive', 'sand'] }),

