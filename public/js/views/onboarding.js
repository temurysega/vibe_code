// Первое действие в кабинете, затем необязательная настройка образа и питомца.
import { patch, post } from '../lib/api.js';
import { session, setPlay } from '../lib/bus.js';
import { esc } from '../lib/format.js';
import { icon } from '../ui/icons.js';
import { modal, toast } from '../ui/overlay.js';
import * as fx from '../ui/fx.js';
import { svg as avatarSvg, pet as petSvg, applyBody, SKIN } from '../art/avatar.js';
import { APPEARANCE, FIRST_STEPS } from '../shared/catalog.js';

export function openOnboarding() {
  const p = session.play;
  let step = 0;
  let av = Object.assign({}, p.av);
  let petName = p.petName;
  const hairs = APPEARANCE.hair.filter(([id]) => id !== 'none');

  const views = [
    () => `<div class="modal-title">С чего начать</div>
      <p class="modal-sub">Выберите, что нужно сейчас. Кнопка сразу откроет нужный раздел.</p>
      <div class="start-actions">
        ${[['calendar', 'Посмотреть расписание', 'Выберите день и нажмите занятие: увидите аудиторию, преподавателя и изменения.', '#/schedule'], ['chart', 'Проверить учёбу', 'Откройте дисциплину: посмотрите баллы и что нужно сделать дальше.', '#/grades'], ['doc', 'Заказать справку об обучении', 'Укажите, куда нужна справка, и отправьте её в деканат. Данные профиля уже заполнены.', '#/requests/new/study']]
          .map(([ic, title, description, route], index) => `<a class="start-action" data-start-route href="${route}"${index === 0 ? ' autofocus' : ''}>${icon(ic, 22)}<span><b>${title}</b><small>${description}</small></span>${icon('arrow', 18)}</a>`).join('')}
      </div>
      <div class="modal-foot"><button class="btn btn-secondary" data-next>Настроить аватар</button><button class="btn btn-ghost" data-close>Пока закрыть</button></div>`,
    () => `<div class="modal-title">Ваш аватар</div><p class="modal-sub">Остальное — в гардеробе кампуса. Всё бесплатно</p>
      <div class="onb-grid mt-20"><div class="onb-ava">${avatarSvg(av, { view: 'full' })}</div><div>
        <div class="opt-title">Фигура</div><div class="chips">${APPEARANCE.body.map(([id, n]) => `<button class="chip ${av.body === id ? 'on' : ''}" data-body="${id}">${n}</button>`).join('')}</div>
        <div class="opt-title mt-16">Тон кожи</div><div class="swatches">${APPEARANCE.skin.map(([id, c]) => `<button class="swatch ${av.skin === id ? 'on' : ''}" style="background:${c}" data-skin="${id}" aria-label="Тон кожи"></button>`).join('')}</div>
        <div class="opt-title mt-16">Причёска</div><div class="chips">${hairs.map(([id, n]) => `<button class="chip ${av.hair === id ? 'on' : ''}" data-hair="${id}">${n}</button>`).join('')}</div>
        <div class="opt-title mt-16">Цвет волос</div><div class="chips">${APPEARANCE.hairColor.slice(0, 7).map(([id, n]) => `<button class="chip ${av.hairColor === id ? 'on' : ''}" data-hc="${id}">${n}</button>`).join('')}</div>
      </div></div>
      <div class="steps"><i class="on"></i><i class="on"></i><i></i></div>
      <div class="modal-foot"><button class="btn btn-primary btn-lg" data-next>Дальше ${icon('arrow', 18)}</button><button class="btn btn-ghost btn-lg" data-prev>Назад</button></div>`,
    () => `<div class="modal-title">Питомец</div><p class="modal-sub">Он подскажет про пару и дедлайн и будет расти, пока вы учитесь</p>
      <div class="row mt-20" style="gap:12px;flex-wrap:wrap">${[['cat', 'orange', 'Кот'], ['cat', 'gray', 'Серый кот'], ['dog', 'sand', 'Пёс'], ['dog', 'white', 'Белый пёс']].map(([t, c, n]) => `<button class="item ${av.pet === t && av.petColor === c ? 'on' : ''}" style="width:130px" data-pet="${t}" data-color="${c}"><span class="item-pic">${petSvg(t, c)}</span><span class="item-name">${n}</span></button>`).join('')}</div>
      <label class="field mt-20"><span class="field-label">Как зовут питомца</span><input class="input" data-petname maxlength="24" value="${esc(petName)}"></label>
      <div class="steps"><i class="on"></i><i class="on"></i><i class="on"></i></div>
      <div class="modal-foot"><button class="btn btn-primary btn-lg" data-save>${icon('check', 18)} Готово</button><button class="btn btn-ghost btn-lg" data-prev>Назад</button></div>`,
  ];

  const entry = modal.open({
    label: 'С чего начать',
    size: 'wide',
    html: views[0](),
    onMount(el, en, render) {
      const paint = () => render(views[step]());
      el.addEventListener('input', (e) => { if (e.target.matches('[data-petname]')) petName = e.target.value; });
      el.addEventListener('click', async (e) => {
        const start = e.target.closest('[data-start-route]');
        if (start) {
          e.preventDefault();
          modal.close(en);
          location.hash = start.getAttribute('href');
          return;
        }
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.next != null) { step++; paint(); return; }
        if (t.dataset.prev != null) { step--; paint(); return; }
        if (t.dataset.body) { av = applyBody(av, t.dataset.body); paint(); return; }
        if (t.dataset.skin && SKIN[t.dataset.skin]) { av.skin = t.dataset.skin; paint(); return; }
        if (t.dataset.hair) { av.hair = t.dataset.hair; paint(); return; }
        if (t.dataset.hc) { av.hairColor = t.dataset.hc; paint(); return; }
        if (t.dataset.pet) { av.pet = t.dataset.pet; av.petColor = t.dataset.color; paint(); return; }
        if (t.dataset.save != null) {
          t.disabled = true;
          try {
            const look = { body: av.body, skin: av.skin, hair: av.hair, hairColor: av.hairColor, cheeks: av.cheeks, eyes: av.eyes, facial: av.facial, bottom: av.bottom, bottomColor: av.bottomColor, pet: av.pet, petColor: av.petColor };
            const r = await patch('/api/play/look', { av: look, petName: petName.trim() || 'Пиксель', onboarded: true });
            setPlay(r.play);
            modal.close(en);
            fx.confetti({ n: 100 });
            toast('Аватар готов! Загляните в гардероб кампуса за новыми вещами', { icon: 'hanger' });
          } catch (er) {
            t.disabled = false;
            toast(esc(er.message), { icon: 'alert' });
          }
        }
      });
    },
  });
  return entry;
}

export function openQuiz() {
  const answers = FIRST_STEPS.quiz.map(() => null);
  let result = null;
  const view = () => `<div class="modal-title">Квиз «Как устроен кабинет»</div><p class="modal-sub">Пять вопросов. Нужно 4 верных ответа</p>
    <div class="mt-20">${FIRST_STEPS.quiz.map((q, i) => `<fieldset class="quiz-q"><legend>${i + 1}. ${esc(q.q)}</legend>${q.a.map((a, j) => {
      const cls = result ? (j === q.ok ? 'ok' : answers[i] === j ? 'bad' : '') : '';
      return `<label class="quiz-opt ${cls}"><input type="radio" name="q${i}" value="${j}" ${answers[i] === j ? 'checked' : ''} ${result ? 'disabled' : ''}><span>${esc(a)}</span></label>`;
    }).join('')}</fieldset>`).join('')}</div>
    ${result ? `<div class="note ${result.passed ? 'note-navy' : 'note-warn'} mt-20">${icon(result.passed ? 'check' : 'info', 18)}<span>${result.passed ? `Верно ${result.score} из ${result.total} — шаг засчитан!` : `Верно ${result.score} из ${result.total}. Попробуйте ещё раз`}</span></div>` : ''}
    <div class="modal-foot">${result ? (result.passed ? '<button class="btn btn-primary btn-lg" data-close>Готово</button>' : '<button class="btn btn-primary btn-lg" data-again>Ещё раз</button>') : '<button class="btn btn-primary btn-lg" data-check>Проверить</button>'}</div>`;
  modal.open({
    label: 'Квиз',
    size: 'wide',
    html: view(),
    onMount(el, en, render) {
      el.addEventListener('change', (e) => { const m = /^q(\d)$/.exec(e.target.name || ''); if (m) answers[+m[1]] = +e.target.value; });
      el.addEventListener('click', async (e) => {
        if (e.target.closest('[data-again]')) { result = null; answers.fill(null); render(view()); return; }
        if (!e.target.closest('[data-check]')) return;
        if (answers.some((a) => a == null)) { toast('Ответьте на все вопросы', { icon: 'info' }); return; }
        try {
          const r = await post('/api/play/quiz', { answers });
          setPlay(r.play);
          result = r.result;
          render(view());
          if (result.passed) fx.confetti({ n: 80 });
        } catch (er) { toast(esc(er.message), { icon: 'alert' }); }
      });
    },
  });
}
