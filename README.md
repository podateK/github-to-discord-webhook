# GitHub → Discord webhook relay

Prosty serwer Node.js/Express, który przyjmuje webhooki z GitHuba i przekazuje je jako sformatowane wiadomości na Discorda.

## 1. Instalacja

```bash
npm install
```

## 2. Konfiguracja

Skopiujcie `.env.example` do `.env` i uzupełnijcie:

```bash
cp .env.example .env
```

- **DISCORD_WEBHOOK_URL** — utwórzcie webhook na Discordzie: Ustawienia kanału → Integracje → Webhooki → Nowy webhook → skopiujcie URL.
- **GITHUB_WEBHOOK_SECRET** — dowolny sekretny ciąg znaków, który wpiszecie też w konfiguracji webhooka na GitHubie (opcjonalne, ale mocno zalecane, żeby nikt obcy nie mógł podszywać się pod GitHuba).

## 3. Uruchomienie

```bash
npm start
```

Serwer wystartuje domyślnie na porcie 3000, endpoint webhooka to:

```
POST /webhook/github
```

## 4. Wdrożenie na api.podatek.dev

Musicie mieć proces node działający pod tą domeną — np. przez `pm2`:

```bash
npm install -g pm2
pm2 start index.js --name github-discord-relay
pm2 save
```

Skonfigurujcie reverse proxy (nginx/caddy) tak, żeby `https://api.podatek.dev/webhook/github` przekierowywało do lokalnego portu (np. 3000).

Przykład dla nginx:

```nginx
location /webhook/github {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## 5. Konfiguracja webhooka na GitHubie

W repo: **Settings → Webhooks → Add webhook**

- **Payload URL**: `https://api.podatek.dev/webhook/github`
- **Content type**: `application/json`
- **Secret**: ten sam co w `.env` (GITHUB_WEBHOOK_SECRET)
- **Which events**: wybierzcie interesujące (push, pull requests, issues, star, itd.)

Po zapisaniu GitHub wyśle event `ping` — jeśli w logach serwera zobaczycie "Otrzymano ping od GitHuba", wszystko działa.

## Obsługiwane eventy

- `push` — lista commitów
- `pull_request` — otwarcie/zamknięcie/zmiana PR
- `issues` — otwarcie/zamknięcie issue
- `star` — nowa gwiazdka
- inne eventy — wysyłane jako uproszczona wiadomość fallback

Możecie łatwo dodać obsługę kolejnych typów w funkcji `buildDiscordMessage()` w `index.js`.
