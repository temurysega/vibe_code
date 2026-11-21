# Фрагменты снимков для PDF, 21 ноября

Для описания процесса мобильные кадры обрезаны до действия, чтобы текст читался в PDF без увеличения.
Источник — снимки итогового прогона [release-1121-final](../release-1121-final/) (код `c37c69a`), обрезка
командой `sips -c <высота> 360 --cropOffset <сверху> 0`, без других изменений.

| Файл | Источник | Строки пикселей |
|---|---|---|
| `360-request-form.png` | `360-requests-new-study.png` | 100–730 |
| `360-request-status.png` | `360-request-ready.png` | 100–660 |
| `360-request-ready-card.png` | `360-request-ready.png` | 995–1220 |
| `360-certificate-pdf.png` | `360-certificate-actions.png` | 100–520 |
| `360-schedule-today.png` | `360-schedule.png` | 100–730 |
| `360-sandbox-link.png` | `360-sandbox-link.png` | 200–770 |
| `360-schedule-change.png` | `360-schedule-change-from-notification.png` | 125–795 |

`study-certificate-page1.png` — первая страница файла `study-certificate.pdf`, который набор
`browser-review-fixes` скачал кнопкой «Скачать PDF» на 360 px; отрисована PDFKit (macOS) и уменьшена
до 1300 px по длинной стороне. Это изображение файла, а не снимок экрана.
