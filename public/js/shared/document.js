// Текст электронной справки — один источник для страницы в браузере и PDF на сервере.
// Модуль возвращает структуру: абзацы с выделением, таблицы и подписи; оформление делает каждая сторона.

const FAC_EN = { 'Факультет международных отношений': 'School of International Relations', 'Международно-правовой факультет': 'International Law School', 'Факультет международных экономических отношений': 'School of International Economic Relations' };
const PROGRAM_EN = { 'Международные отношения': 'International Relations', 'Экономика': 'Economics', 'Юриспруденция': 'Law' };
const COUNTRY_EN = { 'сербия': 'Serbia', 'китай': 'China', 'франция': 'France', 'оаэ': 'the UAE', 'индия': 'India', 'бразилия': 'Brazil', 'германия': 'Germany', 'италия': 'Italy', 'испания': 'Spain', 'турция': 'Turkey', 'египет': 'Egypt', 'япония': 'Japan', 'корея': 'Korea', 'вьетнам': 'Vietnam', 'армения': 'Armenia', 'казахстан': 'Kazakhstan', 'узбекистан': 'Uzbekistan', 'беларусь': 'Belarus' };
// Дисциплины демо-данных по-английски: в выписке нужен перевод, транслитерация — только запасной вариант
const COURSE_EN = {
  'Административное право': 'Administrative Law', 'Английский язык': 'English', 'Английский язык для юристов': 'English for Lawyers',
  'Арабский язык': 'Arabic', 'Арбитражный процесс': 'Commercial Court Procedure', 'Введение в теорию международных отношений': 'Introduction to International Relations Theory',
  'Высшая математика': 'Higher Mathematics', 'Гражданский процесс': 'Civil Procedure', 'Гражданское право': 'Civil Law',
  'Дипломатический протокол и этикет': 'Diplomatic Protocol and Etiquette', 'Информатика': 'Computer Science', 'История России': 'History of Russia',
  'История государства и права': 'History of State and Law', 'История дипломатии': 'History of Diplomacy', 'История международных отношений': 'History of International Relations',
  'Китайский язык': 'Chinese', 'Конкурентное право': 'Competition Law', 'Конституционное право': 'Constitutional Law', 'Криминалистика': 'Criminalistics',
  'Курсовая работа': 'Term Paper', 'Логика': 'Logic', 'Математика': 'Mathematics', 'Международное публичное право': 'Public International Law',
  'Международное уголовное право': 'International Criminal Law', 'Международное частное право': 'Private International Law',
  'Международное экономическое право': 'International Economic Law', 'Международный арбитраж': 'International Arbitration', 'Микроэкономика': 'Microeconomics',
  'Мировая экономика': 'World Economy', 'Налоговое право': 'Tax Law', 'Научно-исследовательский семинар': 'Research Seminar',
  'Основы российской государственности': 'Foundations of Russian Statehood', 'Политология': 'Political Science',
  'Право Евразийского экономического союза': 'Law of the Eurasian Economic Union', 'Право Европейского союза': 'European Union Law',
  'Право внешних сношений': 'Law of External Relations', 'Право международных организаций': 'Law of International Organisations',
  'Профессиональная этика юриста': 'Legal Ethics', 'Римское право': 'Roman Law', 'Семейное право': 'Family Law', 'Теория государства и права': 'Theory of State and Law',
  'Теория международных отношений': 'International Relations Theory', 'Трудовое право': 'Labour Law', 'Уголовное право': 'Criminal Law',
  'Уголовный процесс': 'Criminal Procedure', 'Учебная практика': 'Practical Training', 'Физическая культура': 'Physical Education', 'Философия': 'Philosophy',
  'Французский язык': 'French', 'Французский язык (профессиональный)': 'French for Professional Purposes', 'Экономика': 'Economics',
  'Экономическая история': 'Economic History', 'Экономическая теория': 'Economic Theory',
};
const TITLE_EN = { transcript: 'Academic Transcript', study: 'Certificate of Enrolment', visa: 'Certificate of Enrolment' };
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: 'ie', ы: 'y', ь: '', э: 'e', ю: 'iu', я: 'ia' };

export const translit = (s) => String(s).split('').map((c) => { const l = c.toLowerCase(); const t = TR[l]; if (t == null) return c; return c === l ? t : t.charAt(0).toUpperCase() + t.slice(1); }).join('');
const programEn = (p) => p.replace(/^(\S+)\s+(.+)$/, (m, code, name) => `${code} ${PROGRAM_EN[name] || translit(name)}`);
export const courseEn = (name) => COURSE_EN[name] || translit(name);
const countryEn = (c) => COUNTRY_EN[String(c || '').trim().toLowerCase()] || translit(c || '');

export const money = (value) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2 }).format(value);
export const monthLabel = (value) => new Date(`${value}-01T12:00:00Z`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
// Код проверки читается группами по четыре знака
export const codeGroups = (code) => (String(code || '').match(/.{1,4}/g) || []).join('-');

export function documentModel(d, history) {
  const en = d.lang === 'en';
  const fio = `${d.student.lastName} ${d.student.firstName} ${d.student.middleName || ''}`.trim();
  const f = d.student.gender === 'f';
  const paragraphs = [];
  if (en) {
    const name = translit(`${d.student.firstName} ${d.student.lastName}`);
    paragraphs.push([{ t: 'This is to certify that ' }, { t: name, b: true }, { t: ` is a full-time ${d.course}${['st', 'nd', 'rd'][d.course - 1] || 'th'}-year student of the ${FAC_EN[d.faculty] || translit(d.faculty)}, bachelor's programme “${programEn(d.program)}”, academic year ${d.academicYear}.` }]);
    paragraphs.push([{ t: `Expected graduation: ${d.graduationYear}. ${d.type === 'visa' ? `The certificate is issued for submission to the consular office for a trip to ${countryEn(d.payload.country)}${d.payload.dates ? ` (${d.payload.dates})` : ''}. The student is granted academic leave for the period of travel.` : 'The certificate is issued upon request.'}` }]);
  } else {
    paragraphs.push([{ t: 'Настоящая справка подтверждает, что ' }, { t: fio, b: true }, { t: ` действительно является ${f ? 'студенткой' : 'студентом'} ${d.course} курса (${d.faculty.toLowerCase()}), направление подготовки «${d.program}», профиль «${d.profile}», форма обучения — ${d.studyForm}, основа — ${d.funding === 'бюджет' ? 'бюджетная' : 'договорная'}.` }]);
    paragraphs.push([{ t: `Срок обучения: ${d.admissionYear}–${d.graduationYear}. Номер зачётной книжки: ${d.recordBook}.` }]);
    paragraphs.push([{ t: d.payload.place ? `Справка выдана для предоставления: ${d.payload.place}.` : 'Справка выдана по месту требования.' }]);
  }
  let stipend = null;
  if (d.type === 'stipend' && d.stipend) {
    const s = d.stipend;
    stipend = {
      intro: [{ t: 'Академическая стипендия за шесть завершённых месяцев перед подачей заявки: ' }, { t: `${monthLabel(s.from)} — ${monthLabel(s.to)}`.replace(/\.$/, ''), b: true }, { t: '.' }],
      head: ['Месяц и основание', 'Начислено'],
      rows: s.months.map((row) => ({ month: monthLabel(row.month), reason: row.reason, amount: money(row.amount) })),
      total: { label: 'Итого за 6 месяцев', amount: money(s.total) },
      zero: s.total === 0 ? 'За указанный период академическая стипендия не начислялась.' : null,
      note: s.note,
    };
  }
  let transcript = null;
  if (d.type === 'transcript' && history) {
    transcript = {
      head: en ? ['Course', 'Term', 'Points', 'ECTS'] : ['Дисциплина', 'Семестр', 'Баллы', 'ECTS'],
      rows: history.flatMap((h) => h.list.map((x) => [en ? courseEn(x.name) : x.name, String(h.semester), String(x.points), x.verdict.letter])),
    };
  }
  // Дата выдачи — по Москве, одинаково в браузере и на сервере в UTC
  const issued = new Date(d.issuedAt).toLocaleDateString(en ? 'en-GB' : 'ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' });
  return {
    en,
    title: en ? TITLE_EN[d.type] || 'Certificate' : d.title,
    numberLine: `№ ${d.number} ${en ? 'of' : 'от'} ${issued}`,
    org: en ? 'MGIMO Mania — a demo concept' : 'МГИМО Мания — демонстрационный концепт',
    brand: en ? 'MGIMO Mania' : 'МГИМО Мания',
    sample: en ? 'Sample of an electronic certificate · not an official document' : 'Образец электронной справки · не является официальным документом',
    paragraphs, stipend, transcript,
    sign: en ? 'Demo dean’s office' : 'Демонстрационный деканат',
    unsigned: en ? 'Sample, without an electronic signature' : 'Образец без электронной подписи',
    verifyLabel: en ? 'Verify this sample' : 'Проверка образца',
    watermark: en ? 'SAMPLE' : 'ОБРАЗЕЦ',
  };
}
