# Лёгкий Windows-прототип

Оболочка использует системные .NET Framework 4.8 и WebView2 Evergreen Runtime. Node.js, Playwright и Chromium в поставку не входят. Это Windows-прототип на WinForms/WebView2, не Tauri. EXE требует DLL из папки сборки: распространяйте папку/ZIP целиком, не один EXE.

## Сборка и запуск

Нужны Windows, .NET SDK и Node.js для сборки:

```powershell
npm ci
npm run desktop:build
npm run dev
```

В другом терминале: `npm run desktop:dev`. Этот режим доверяет только `http://127.0.0.1:5173/`. Сам Node-адаптер при работе через desktop не используется: Vite нужен лишь для отдачи интерфейса.

Без `--dev` EXE загружает упакованный локальный интерфейс из `ui/`. Для автономной сборки выполните `npm run desktop:build`.

Файлы: `desktop/bin/Release/net48/`. На пользовательской машине нужны .NET Framework 4.8 и [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/). Если компонентов нет, их нужно установить отдельно: маленький размер приложения не означает отсутствие системных зависимостей.

## Границы прототипа

- Вход только в официальном окне приложения, пароль не передаётся локальному интерфейсу.
- Работают команды чтения профиля, расписания, урока, групп, учеников и методпакетов. Данные сверяются по аккаунту до и после запроса.
- Смена преподавателя через наш селектор пока не поддерживается; используйте официальное окно и обновите данные. Запись оценок не реализована.
- Превью Academy PDF/изображений через ограниченный загрузчик, максимум 8 МБ. Доступность хранилища зависит от сети. Внешние всплывающие окна заблокированы в прототипе.
- Закрытие окна входа скрывает его, сохраняя сессию до закрытия приложения. Профили лежат в `%LOCALAPPDATA%/OmniWorkspace/`, отдельно для интерфейса и Omni.
- Нет автоматического обновления EXE, установщика или подписи. Изменение протокола адаптера требует новой сборки EXE. Интерфейс обновляется вместе со сборкой приложения.
- Полный вход и работа с реальным аккаунтом требуют ручной проверки; проверка загрузки страницы входа не равнозначна успешной авторизации.

## Безопасность

У WebView нет host objects, доступа к shell или произвольному выполнению кода. Оболочка проверяет источник и текущий URL, ограничивает навигацию и набор команд. Для Omni используется отдельное окно и отдельный профиль. Секреты сессии не возвращаются интерфейсу. JS-адаптер встроен в EXE, а не скачивается с Pages. Внешние редиректы загрузчика файлов проверяются на каждом шаге.

Код интерфейса с Pages всё равно получает учебные данные через разрешённые команды. Поэтому защита main-ветки, аккаунта GitHub и доверие к публикуемому коду обязательны. Нельзя считать удалённый интерфейс недоверенным и одновременно давать ему доступ к данным аккаунта.

## Проверки

`npm test`, `npm run build:pages`, `npm run desktop:build`.

При запущенном dev-сервере: `Omni.Desktop.exe --dev --smoke-test`. Автотест открывает настоящую официальную страницу, не отправляя логин/пароль; проверяет мост UI, отклонение неизвестной команды и состояние официального окна. Результат без персональных данных сохраняется рядом с EXE в `smoke-result.json`. Окна теста прозрачные и закрываются автоматически. Не запускается обычным CI, поскольку требует Windows, WebView2 и сети.

The production interface is packaged under `ui/` beside the executable and served through WebView2 virtual host `https://omni-workspace.example/`. Run `npm run desktop:build`; distribute the entire output including `ui/`. GitHub Pages is not used. The smoke test requires the local React interface to mount before exercising the native bridge.

Use `Omni.Desktop.exe --smoke-test-local` for offline packaged-UI, bridge, canceled-navigation/reply, accepted-reload invalidation and in-place brand navigation checks. Existing `--smoke-test` also checks the official login page and requires network access. The result records `mode: "local"` or `mode: "online"`; local success does not verify official login.
