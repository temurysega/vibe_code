// «Как защищены данные» и демо-тур для жюри: короткий проход по главным сценариям кабинета.
import { session } from '../lib/bus.js';
import { esc } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal } from '../ui/overlay.js';

export function openAbout() {
  const rows = [
    ['user', 'Каждый видит только своё', 'Студент определяется по сессии на сервере, а не по адресу. Чужая заявка по прямой ссылке отвечает «не найдено» — попробуйте открыть #/requests/1 под Ксенией. Деканат видит только свой факультет'],
    ['key', 'Пароли не хранятся открыто', 'В базе только хеш scrypt со случайной солью. Сравнение — за постоянное время. После 5 неверных попыток вход блокируется на 15 минут'],
    ['lock', 'Сеанс защищён', 'Случайный ключ в cookie с флагами HttpOnly, SameSite и Secure — скрипты страницы его не видят. В базе лежит только SHA-256 от ключа. Активные сеансы можно завершить в профиле'],
    ['shield', 'Защита от подделки запросов', 'Изменяющие запросы требуют CSRF-токен своей сессии и проверку Origin. Политика CSP запрещает чужие скрипты, вывод данных экранируется'],
    ['sparkles', 'Ключ ИИ — только на сервере', 'Помощник «Спросить деканат» обращается к ИИ через сервер: ключ лежит в переменной окружения, не в коде и не в браузере. Модель получает учебный контекст только текущего студента. Без ключа работают встроенные подсказки'],
    ['docs', 'Минимум данных', 'Нет паспорта и СНИЛС, номер зачётки и телефон скрыты до нажатия. Учебные данные не сохраняются в localStorage браузера. Электронную справку можно проверить по коду — без раскрытия ФИО'],
  ];
  modal.open({
    label: 'Как защищены данные',
    size: 'wide',
    html: `<span class="eyebrow">Безопасность и архитектура</span><div class="modal-title mt-8">Как защищены данные</div>
      <p class="modal-sub">Концепт для конкурса: все люди и данные вымышлены, но защита — настоящая</p>
      <div class="col mt-20" style="gap:10px">${rows.map(([ic, t, d]) => `<div class="row" style="align-items:flex-start;background:var(--surface);border-radius:14px;padding:14px"><span class="way-n">${icon(ic, 18)}</span><div><b style="font-weight:500">${t}</b><div class="small muted mt-4">${esc(d)}</div></div></div>`).join('')}</div>
      <div class="note note-navy mt-16">${icon('building', 18)}<span>Прототип не подключён к системам вуза. Данные и заявки сохраняются в его собственной базе; справки служат демонстрационными образцами.</span></div>
      <div class="modal-foot"><button class="btn btn-primary btn-lg" data-close>Понятно</button></div>`,
  });
}

// ---------- демо-тур ----------
const STEPS = [
  ['#/home', '[data-sec="next"]', 'Главная: ближайшая пара с аудиторией, этажом и обратным отсчётом. Изменения подсвечены'],
  ['#/home', '[data-sec="mood"]', '«Как у меня дела» простыми словами: средний балл, рейтинг и что подтянуть'],
  ['#/schedule', '.changes-strip, .week', 'Расписание на неделю: отмены, переносы и новые аудитории видны сразу. Экспорт в календарь — одной кнопкой'],
  ['#/grades', '.disc-grid', 'Успеваемость: баллы, прогноз пунктиром и сколько не хватает до «отлично»'],
  ['#/requests/new', '.cat-grid', 'Заявки: справка за минуту. Данные из профиля подставятся сами, статус придёт уведомлением'],
  ['#/notifications', '.n-list', 'Уведомления: деканат, расписание, дедлайны и заявки — в одной ленте с фильтрами'],
  ['#/campus', '.campus-card', 'Кампус: зоны ведут в разделы кабинета, за прогулку — М-коины и вещи для аватара'],
  ['#/game', '.runner-card', 'Перерыв: «Бегом на пару» — 5 минут в день, лимит считает сервер'],
];
let tour = null;

function stopTour() {
  if (!tour) return;
  clearTimeout(tour.timer);
  document.querySelectorAll('.demo-hl').forEach((x) => x.classList.remove('demo-hl'));
  tour.bar.remove();
  tour = null;
}

function step(i) {
  if (!tour) return;
  if (i >= STEPS.length) { stopTour(); return; }
  tour.i = i;
  const [hash, sel, text] = STEPS[i];
  if (location.hash !== hash) location.hash = hash;
  tour.bar.querySelector('.demo-t').textContent = text;
  tour.bar.querySelector('.demo-n').textContent = `${i + 1} / ${STEPS.length}`;
  // Шаги переключаются вручную: полоса показывает, сколько пройдено, а не таймер
  tour.bar.querySelector('.demo-p i').style.width = `${Math.round(((i + 1) / STEPS.length) * 100)}%`;
  tour.bar.querySelector('[data-prev]').disabled = i === 0;
  tour.bar.querySelector('[data-next]').textContent = i === STEPS.length - 1 ? 'Готово' : 'Дальше';
  let tries = 0;
  const hl = () => {
    document.querySelectorAll('.demo-hl').forEach((x) => x.classList.remove('demo-hl'));
    const el = document.querySelector(sel);
    if (el) { el.classList.add('demo-hl'); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else if (tries++ < 20) setTimeout(hl, 150);
  };
  setTimeout(hl, 350);
}

export function startTour() {
  if (!session.user || session.user.role !== 'student') { modal.open({ label: 'Демо-тур', html: '<div class="modal-title">Демо-тур</div><p class="modal-sub">Тур показывает кабинет студента — войдите как Алина Морозова</p><div class="modal-foot"><button class="btn btn-primary btn-lg" data-close>Хорошо</button></div>' }); return; }
  stopTour();
  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Демо-тур');
  bar.innerHTML = `<span class="demo-n"></span><span class="demo-t" aria-live="polite"></span><button class="btn btn-sm btn-ghost" data-prev style="color:#fff">Назад</button><button class="btn btn-sm btn-gold" data-next>Дальше</button><button class="btn btn-sm btn-ghost" data-stop style="color:#fff">Закрыть</button><span class="demo-p"><i></i></span>`;
  document.body.appendChild(bar);
  tour = { bar, i: 0, timer: null };
  bar.addEventListener('click', (e) => {
    if (e.target.closest('[data-prev]')) step(Math.max(0, tour.i - 1));
    if (e.target.closest('[data-next]')) step(tour.i + 1);
    if (e.target.closest('[data-stop]')) stopTour();
  });
  step(0);
}
