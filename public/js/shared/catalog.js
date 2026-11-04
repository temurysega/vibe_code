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

  I('sneakers', 'shoes', 'Кеды', 'base', { colors: ['gray', 'navy', 'violet', 'graphite'] }),
  I('loafers', 'shoes', 'Лоферы', 'base', { colors: ['black', 'brown'] }),
  I('boots', 'shoes', 'Ботинки', 'base', { colors: ['black', 'brown', 'sand'] }),
  I('hightops', 'shoes', 'Высокие кеды', 'digital', { price: 500, colors: ['violet', 'navy', 'graphite'] }),
  I('runners', 'shoes', 'Кроссовки «Спринт к паре»', 'game', { need: 1500 }),

  I('none', 'hat', 'Без шапки', 'base'),
  I('cap', 'hat', 'Кепка', 'base', { colors: ['graphite', 'navy', 'white', 'violet'] }),
  I('beanie', 'hat', 'Шапка', 'base', { colors: ['navy', 'graphite', 'red', 'sky'] }),
  I('beret', 'hat', 'Берет', 'route', { zone: 'cloakroom', colors: ['navy', 'red', 'graphite'] }),
  I('bucket', 'hat', 'Панама исследователя', 'routeAll'),
  I('mortarboard', 'hat', 'Шапочка выпускника', 'steps'),
  I('mgimo-cap', 'hat', 'Кепка МГИМО', 'kit', { kit: 'kit-cap' }),

  I('none', 'glasses', 'Без очков', 'base'),
  I('square', 'glasses', 'Классические', 'base'),
  I('round', 'glasses', 'Круглые', 'route', { zone: 'library' }),
  I('sun', 'glasses', 'Солнцезащитные', 'digital', { price: 300 }),

  I('none', 'extra', 'Без аксессуара', 'base'),
  I('tie', 'extra', 'Галстук', 'base', { colors: ['navy', 'red', 'gold', 'violet'] }),
  I('scarf', 'extra', 'Шарф', 'base', { colors: ['navy', 'red', 'sand', 'gold'] }),
  I('lanyard', 'extra', 'Студенческий бейдж', 'route', { zone: 'dean' }),
  I('headphones', 'extra', 'Наушники', 'digital', { price: 600, colors: ['navy', 'graphite', 'white'] }),
  I('bag', 'extra', 'Сумка через плечо', 'digital', { price: 400, colors: ['graphite', 'sand', 'navy'] }),
  I('medal', 'extra', 'Медаль «Отличник»', 'grade', { how: 'Сессия без троек и долгов' }),

  I('none', 'pet', 'Без питомца', 'base'),
  I('cat', 'pet', 'Кот', 'base', { colors: ['orange', 'gray', 'black', 'cream'] }),
  I('dog', 'pet', 'Пёс', 'base', { colors: ['sand', 'brown', 'white'] }),
  I('fox', 'pet', 'Лис', 'focus', { need: 3 }),
  I('owl', 'pet', 'Сова-отличница', 'grade', { how: 'Сессия без троек и долгов' }),
  I('hedgehog', 'pet', 'Ёжик', 'routeAll'),
  I('bot', 'pet', 'Робот', 'digital', { price: 800 }),

  I('navy', 'backdrop', 'Синий МГИМО', 'base'),
  I('sky', 'backdrop', 'Небо', 'base'),
  I('violet', 'backdrop', 'Аметист', 'base'),
  I('mint', 'backdrop', 'Мята', 'base'),
  I('peach', 'backdrop', 'Персик', 'base'),
  I('graphite', 'backdrop', 'Графит', 'base'),
  I('rose', 'backdrop', 'Роза', 'route', { zone: 'shop' }),
  I('gold', 'backdrop', 'Золото', 'game', { need: 3000 }),
  I('aurora', 'backdrop', 'Северное сияние', 'digital', { price: 500 }),

  I('none', 'pattern', 'Без узора', 'base'),
  I('dots', 'pattern', 'Точки', 'base'),
  I('globes', 'pattern', 'Глобусы', 'base'),
  I('leaves', 'pattern', 'Листья', 'base'),
  I('rings', 'pattern', 'Кольца', 'base'),
  I('books', 'pattern', 'Книги', 'route', { zone: 'classroom' }),
  I('sparks', 'pattern', 'Искры', 'route', { zone: 'clubs' }),
  I('stars', 'pattern', 'Звёзды', 'game', { need: 800 }),

