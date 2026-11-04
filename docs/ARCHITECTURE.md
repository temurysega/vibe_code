# Архитектура

```
браузер (ES-модули, hash-роутер)
   │  JSON по HTTPS, cookie сессии + CSRF-токен
   ▼
server/app.js ── заголовки, CSRF, Origin, разбор JSON, маршруты, статика
   ├── routes/     auth · student · requests · play · dean · assistant
   ├── domain/     time · schedule · grades · requests · notifications · play · assistant
   ├── security/   password · session · auth · rateLimit · headers
   └── db.js ───── node:sqlite (демо) → PostgreSQL (продакшен)
```

