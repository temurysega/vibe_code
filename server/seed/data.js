// Демо-данные. Все люди, номера зачёток, телефоны и адреса почты вымышлены;
// домен .demo не существует, телефоны с кодом 000 не обслуживаются.

export const FACULTIES = [
  ['mo', 'МО', 'Факультет международных отношений', '2012', 'пн–пт 10:00–17:00, обед 13:00–13:45', '+7 (495) 000-20-12', 'dekanat.mo@mgimo-mania.demo'],
  ['mp', 'МП', 'Международно-правовой факультет', '3010', 'пн–пт 10:00–17:00, обед 13:00–13:45', '+7 (495) 000-30-10', 'dekanat.mp@mgimo-mania.demo'],
  ['meo', 'МЭО', 'Факультет международных экономических отношений', '1015', 'пн–пт 09:30–17:30, обед 13:00–13:45', '+7 (495) 000-10-15', 'dekanat.meo@mgimo-mania.demo'],
  ['mj', 'МЖ', 'Факультет международной журналистики', '4021', 'пн–пт 10:00–17:00', '+7 (495) 000-40-21', 'dekanat.mj@mgimo-mania.demo'],
  ['fup', 'ФУП', 'Факультет управления и политики', '2030', 'пн–пт 10:00–17:00', '+7 (495) 000-20-30', 'dekanat.fup@mgimo-mania.demo'],
  ['mbda', 'МБДА', 'Факультет международного бизнеса и делового администрирования', '1040', 'пн–пт 10:00–17:00', '+7 (495) 000-10-40', 'dekanat.mbda@mgimo-mania.demo'],
  ['limk', 'ЛиМК', 'Факультет лингвистики и межкультурной коммуникации', '3044', 'пн–пт 10:00–17:00', '+7 (495) 000-30-44', 'dekanat.limk@mgimo-mania.demo'],
];

// Группы: код = факультет-год поступления-номер
export const GROUPS = [
  ['МО-25-03', 'mo', 2025, '41.03.05 Международные отношения', 'Мировая политика и дипломатия', 'Ершова Наталья Павловна'],
  ['МО-25-01', 'mo', 2025, '41.03.05 Международные отношения', 'Мировая политика и дипломатия', 'Соколов Пётр Андреевич'],
  ['МО-24-02', 'mo', 2024, '41.03.05 Международные отношения', 'Международная безопасность', 'Орлова Вера Николаевна'],
  ['МЭО-26-07', 'meo', 2026, '38.03.01 Экономика', 'Мировая экономика', 'Гусев Илья Олегович'],
  ['МП-23-02', 'mp', 2023, '40.03.01 Юриспруденция', 'Международное право', 'Тарасова Ольга Игоревна'],
];

// [ключ, ФИО, кратко, звание, кафедра, приёмные часы]
export const TEACHERS = [
  ['sokolov', 'Соколов Пётр Андреевич', 'Соколов П. А.', 'доцент, к. и. н.', 'Кафедра истории и политики', 'пн 13:50–15:10, каф. 2041'],
  ['ershova', 'Ершова Наталья Павловна', 'Ершова Н. П.', 'профессор, д. полит. н.', 'Кафедра мировой политики', 'вт 15:20–16:40, каф. 2050'],
  ['clark', 'Кларк Анна Викторовна', 'Кларк А. В.', 'старший преподаватель', 'Кафедра английского языка № 1', 'ср 13:50–15:10, каф. 4012'],
  ['melnikova', 'Мельникова Светлана Игоревна', 'Мельникова С. И.', 'доцент, к. филол. н.', 'Кафедра английского языка № 1', 'чт 12:20–13:40, каф. 4012'],
  ['nazarova', 'Назарова Лейла Тимуровна', 'Назарова Л. Т.', 'доцент, к. филол. н.', 'Кафедра востоковедения', 'чт 13:50–15:10, каф. 4030'],
  ['gusev', 'Гусев Илья Олегович', 'Гусев И. О.', 'доцент, к. э. н.', 'Кафедра мировой экономики', 'пт 12:20–13:40, каф. 1033'],
  ['tarasova', 'Тарасова Ольга Игоревна', 'Тарасова О. И.', 'профессор, д. ю. н.', 'Кафедра международного права', 'ср 15:20–16:40, каф. 3021'],
  ['belkin', 'Белкин Аркадий Семёнович', 'Белкин А. С.', 'доцент, к. филос. н.', 'Кафедра философии', 'сб 12:20–13:40, каф. 2015'],
  ['orlova', 'Орлова Вера Николаевна', 'Орлова В. Н.', 'доцент, к. полит. н.', 'Кафедра дипломатии', 'вт 13:50–15:10, каф. 2033'],
  ['kravets', 'Кравец Денис Юрьевич', 'Кравец Д. Ю.', 'старший преподаватель', 'Кафедра физического воспитания', 'по записи, спорткомплекс'],
  ['wang', 'Ван Лин', 'Ван Лин', 'преподаватель', 'Кафедра востоковедения', 'пн 15:20–16:40, каф. 4030'],
  ['kovalchuk', 'Ковальчук Андрей Петрович', 'Ковальчук А. П.', 'доцент, к. э. н.', 'Кафедра экономической теории', 'ср 12:20–13:40, каф. 1021'],
  ['remizova', 'Ремизова Дарья Олеговна', 'Ремизова Д. О.', 'доцент, к. ф.-м. н.', 'Кафедра математики и эконометрики', 'вт 12:20–13:40, каф. 1048'],
  ['shirokova', 'Широкова Анна Львовна', 'Широкова А. Л.', 'доцент, к. и. н.', 'Кафедра экономической истории', 'чт 15:20–16:40, каф. 1027'],
  ['fomin', 'Фомин Сергей Викторович', 'Фомин С. В.', 'доцент, к. полит. н.', 'Кафедра государственного управления', 'пт 13:50–15:10, каф. 2022'],
  ['lefebvre', 'Лефевр Мари', 'Лефевр М.', 'старший преподаватель', 'Кафедра французского языка', 'пн 12:20–13:40, каф. 4044'],
  ['shevchenko', 'Шевченко Глеб Аркадьевич', 'Шевченко Г. А.', 'доцент, к. ю. н.', 'Кафедра международного частного права', 'чт 13:50–15:10, каф. 3015'],
  ['polyakova', 'Полякова Ирина Сергеевна', 'Полякова И. С.', 'доцент, к. ю. н.', 'Кафедра интеграционного права', 'пт 15:20–16:40, каф. 3028'],
  ['zaitsev', 'Зайцев Михаил Борисович', 'Зайцев М. Б.', 'профессор, д. ю. н.', 'Кафедра уголовного права', 'вт 15:20–16:40, каф. 3036'],
];

export const PALETTE = ['#1F4FA8', '#5B8DEF', '#C9A646', '#8E6CC4', '#3BAE8A', '#E0735A', '#C98A4B', '#D2618F', '#2F9CB3', '#7A8699'];

// Учебный план текущего семестра: [дисциплина, форма контроля, ЗЕ, преподаватель, сила студента в предмете 0..1]
// и регулярные пары: [день, пара, чётность, вид, аудитория]
export const PLAN = {
  'МО-25-03': [
    { name: 'История международных отношений', short: 'История МО', control: 'exam', credits: 5, teacher: 'sokolov', lessons: [[1, 1, 'all', 'lecture', '1001'], [3, 2, 'all', 'seminar', '2007']] },
    { name: 'Теория международных отношений', short: 'Теория МО', control: 'exam', credits: 4, teacher: 'ershova', lessons: [[2, 2, 'all', 'lecture', '1023'], [4, 3, 'odd', 'seminar', '2014']] },
    { name: 'Английский язык', short: 'Английский', control: 'graded', credits: 6, teacher: 'clark', lessons: [[1, 3, 'all', 'language', '4018'], [3, 3, 'all', 'language', '4018'], [5, 2, 'all', 'language', '4022']] },
    { name: 'Арабский язык', short: 'Арабский', control: 'exam', credits: 6, teacher: 'nazarova', lessons: [[2, 3, 'all', 'language', '4031'], [4, 1, 'all', 'language', '4031'], [5, 3, 'all', 'language', '4031']] },
    { name: 'Мировая экономика', short: 'Мировая эк.', control: 'credit', credits: 3, teacher: 'gusev', lessons: [[4, 2, 'all', 'lecture', '1001'], [6, 1, 'even', 'seminar', '1036']] },
    { name: 'Международное публичное право', short: 'МПП', control: 'exam', credits: 4, teacher: 'tarasova', lessons: [[3, 1, 'all', 'lecture', '1023'], [5, 1, 'all', 'seminar', '3008']] },
    { name: 'Философия', short: 'Философия', control: 'credit', credits: 2, teacher: 'belkin', lessons: [[6, 2, 'all', 'seminar', '2019']] },
    { name: 'Дипломатический протокол и этикет', short: 'Протокол', control: 'credit', credits: 2, teacher: 'orlova', lessons: [[2, 4, 'all', 'seminar', '2033']] },
    { name: 'Физическая культура', short: 'Физкультура', control: 'credit', credits: 2, teacher: 'kravets', lessons: [[4, 4, 'all', 'sport', 'Спорткомплекс']] },
  ],
  'МЭО-26-07': [
    { name: 'Микроэкономика', short: 'Микроэкономика', control: 'exam', credits: 5, teacher: 'kovalchuk', lessons: [[1, 2, 'all', 'lecture', '1001'], [3, 3, 'all', 'seminar', '1019']] },
    { name: 'Высшая математика', short: 'Математика', control: 'exam', credits: 6, teacher: 'remizova', lessons: [[1, 3, 'all', 'lecture', '1023'], [2, 2, 'all', 'seminar', '1044'], [4, 2, 'odd', 'seminar', '1044']] },
    { name: 'Английский язык', short: 'Английский', control: 'graded', credits: 6, teacher: 'clark', lessons: [[2, 3, 'all', 'language', '4016'], [4, 3, 'all', 'language', '4016'], [5, 1, 'all', 'language', '4016']] },
    { name: 'Китайский язык', short: 'Китайский', control: 'exam', credits: 6, teacher: 'wang', lessons: [[1, 4, 'all', 'language', '4035'], [3, 2, 'all', 'language', '4035'], [5, 2, 'all', 'language', '4035']] },
    { name: 'Экономическая история', short: 'Эк. история', control: 'credit', credits: 3, teacher: 'shirokova', lessons: [[2, 1, 'all', 'lecture', '1036'], [5, 3, 'even', 'seminar', '1027']] },
    { name: 'Основы российской государственности', short: 'ОРГ', control: 'credit', credits: 2, teacher: 'fomin', lessons: [[3, 4, 'all', 'seminar', '2022']] },
    { name: 'Физическая культура', short: 'Физкультура', control: 'credit', credits: 2, teacher: 'kravets', lessons: [[4, 4, 'all', 'sport', 'Спорткомплекс']] },
  ],
  'МП-23-02': [
    { name: 'Международное частное право', short: 'МЧП', control: 'exam', credits: 5, teacher: 'shevchenko', lessons: [[1, 2, 'all', 'lecture', '3001'], [3, 2, 'all', 'seminar', '3015']] },
    { name: 'Международное уголовное право', short: 'Межд. уголовное', control: 'exam', credits: 4, teacher: 'zaitsev', lessons: [[2, 1, 'all', 'lecture', '3001'], [4, 2, 'odd', 'seminar', '3036']] },
    { name: 'Право международных организаций', short: 'Право МО', control: 'exam', credits: 4, teacher: 'tarasova', lessons: [[2, 3, 'all', 'seminar', '3021']] },
    { name: 'Французский язык (профессиональный)', short: 'Французский', control: 'graded', credits: 4, teacher: 'lefebvre', lessons: [[1, 3, 'all', 'language', '4044'], [4, 3, 'all', 'language', '4044']] },
    { name: 'Английский язык для юристов', short: 'Legal English', control: 'graded', credits: 4, teacher: 'melnikova', lessons: [[3, 3, 'all', 'language', '4020'], [5, 2, 'all', 'language', '4020']] },
    { name: 'Международный арбитраж', short: 'Арбитраж', control: 'credit', credits: 3, teacher: 'shevchenko', lessons: [[5, 3, 'all', 'practice', '3015']] },
    { name: 'Научно-исследовательский семинар', short: 'НИС', control: 'credit', credits: 2, teacher: 'polyakova', lessons: [[3, 4, 'even', 'seminar', '3028']] },
  ],
};

// Прошлые семестры: дисциплины для истории оценок
export const PAST = {
  mo: [
    ['История России', 'exam', 4], ['Введение в теорию международных отношений', 'exam', 4], ['Английский язык', 'graded', 6], ['Арабский язык', 'exam', 6], ['Основы российской государственности', 'credit', 2], ['Физическая культура', 'credit', 2],
    ['Политология', 'exam', 4], ['Экономическая теория', 'exam', 4], ['Английский язык', 'graded', 6], ['Арабский язык', 'exam', 6], ['Информатика', 'credit', 2], ['История дипломатии', 'graded', 3],
  ],
  mp: [
    ['Теория государства и права', 'exam', 5], ['Римское право', 'exam', 4], ['Английский язык', 'graded', 6], ['Французский язык', 'exam', 6], ['Логика', 'credit', 2], ['Физическая культура', 'credit', 2],
    ['История государства и права', 'exam', 4], ['Конституционное право', 'exam', 5], ['Английский язык', 'graded', 6], ['Французский язык', 'exam', 6], ['Философия', 'credit', 2], ['Экономика', 'credit', 3],
    ['Гражданское право', 'exam', 5], ['Административное право', 'exam', 4], ['Международное публичное право', 'exam', 5], ['Французский язык', 'graded', 4], ['Английский язык для юристов', 'graded', 4], ['Профессиональная этика юриста', 'credit', 2],
    ['Уголовное право', 'exam', 5], ['Гражданский процесс', 'exam', 4], ['Право Европейского союза', 'exam', 4], ['Французский язык', 'graded', 4], ['Трудовое право', 'credit', 3], ['Криминалистика', 'credit', 2],
    ['Уголовный процесс', 'exam', 4], ['Международное экономическое право', 'exam', 4], ['Конкурентное право', 'exam', 4], ['Французский язык', 'graded', 4], ['Налоговое право', 'credit', 3], ['Курсовая работа', 'graded', 2],
    ['Арбитражный процесс', 'exam', 4], ['Право внешних сношений', 'exam', 4], ['Право Евразийского экономического союза', 'exam', 4], ['Французский язык', 'graded', 4], ['Семейное право', 'credit', 2], ['Учебная практика', 'credit', 3],
  ],
};

// Студенты с учётными записями — герои демо. strength — насколько хорошо учится, weak — дисциплина в зоне риска
export const STUDENTS = [
  {
    key: 'alina', last: 'Морозова', first: 'Алина', middle: 'Дмитриевна', gender: 'f', group: 'МО-25-03', book: '25-МО-0317',
    email: 'a.morozova@student.mgimo-mania.demo', phone: '+7 (900) 000-17-25', funding: 'бюджет', languages: ['Английский', 'Арабский'],
    login: 'a.morozova', strength: 0.92, weak: 'Мировая экономика',
    play: {
      av: { body: 'f', skin: 's2', hair: 'long', hairColor: 'brown', eyes: 'lashes', mouth: 'smile', cheeks: 'blush', facial: 'none', top: 'blazer', topColor: 'navy', bottom: 'skirt', bottomColor: 'graphite', shoes: 'loafers', shoesColor: 'black', hat: 'none', glasses: 'none', extra: 'scarf', extraColor: 'gold', pet: 'cat', petColor: 'orange' },
      prof: { backdrop: 'navy', pattern: 'globes', frame: 'navy', emoji: '🌍', title: 'none' },
      petName: 'Тезис', coins: 1450, growth: 26, sessions: 4, best: 1180, plays: 9, visited: ['dean', 'classroom', 'library'], owned: ['extra:headphones'],
      steps: { onboarded: true, schedule: true, quiz: 5, claimed: true },
    },
  },
  {
    key: 'timur', last: 'Алиев', first: 'Тимур', middle: 'Русланович', gender: 'm', group: 'МЭО-26-07', book: '26-МЭО-0742',
    email: 't.aliev@student.mgimo-mania.demo', phone: '+7 (900) 000-42-07', funding: 'контракт', languages: ['Английский', 'Китайский'],
    login: 't.aliev', strength: 0.78, weak: 'Высшая математика',
    play: {
      av: { body: 'm', skin: 's3', hair: 'short', hairColor: 'black', eyes: 'round', mouth: 'grin', cheeks: 'none', facial: 'none', top: 'hoodie', topColor: 'graphite', bottom: 'joggers', bottomColor: 'navy', shoes: 'sneakers', shoesColor: 'navy', hat: 'none', glasses: 'none', extra: 'none', pet: 'dog', petColor: 'sand' },
      prof: { backdrop: 'sky', pattern: 'dots', frame: 'none', emoji: '🎯', title: 'none' },
      petName: 'Бублик', coins: 0, growth: 2, sessions: 0, best: 0, plays: 0, visited: [], owned: [],
      steps: { onboarded: false, schedule: false, quiz: 0, claimed: false },
    },
  },
  {
    key: 'ksenia', last: 'Лебедева', first: 'Ксения', middle: 'Андреевна', gender: 'f', group: 'МП-23-02', book: '23-МП-0208',
    email: 'k.lebedeva@student.mgimo-mania.demo', phone: '+7 (900) 000-08-23', funding: 'бюджет', languages: ['Английский', 'Французский'],
    login: 'k.lebedeva', strength: 0.84, debt: 'Право Евразийского экономического союза',
    play: {
      av: { body: 'f', skin: 's1', hair: 'bob', hairColor: 'ginger', eyes: 'round', mouth: 'smirk', cheeks: 'freckles', facial: 'none', top: 'turtleneck', topColor: 'cream', bottom: 'trousers', bottomColor: 'navy', shoes: 'boots', shoesColor: 'black', hat: 'none', glasses: 'round', extra: 'headphones', extraColor: 'navy', pet: 'fox' },
      prof: { backdrop: 'peach', pattern: 'books', frame: 'flame', emoji: '⚖️', title: 'runner' },
      petName: 'Кодекс', coins: 2600, growth: 48, sessions: 9, best: 2240, plays: 31, visited: ['cloakroom', 'dean', 'classroom', 'library', 'clubs'], owned: ['extra:headphones', 'top:mgimo-tee'],
      steps: { onboarded: true, schedule: true, quiz: 4, claimed: true },
    },
  },
];

