import express from "express";
import crypto from "crypto";
import "dotenv/config";

const app = express();

// Discord webhook URL - ustawcie w zmiennej środowiskowej DISCORD_WEBHOOK_URL
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
// Opcjonalny secret ustawiony w konfiguracji webhooka na GitHubie (zalecane, dla weryfikacji podpisu)
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

if (!DISCORD_WEBHOOK_URL) {
  console.error("Brak DISCORD_WEBHOOK_URL w zmiennych środowiskowych!");
  process.exit(1);
}

// GitHub wysyła surowe body jako JSON, ale potrzebujemy raw bufora do weryfikacji podpisu
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  }),
);

// Weryfikacja podpisu X-Hub-Signature-256 (żeby nikt obcy nie mógł podszyć się pod webhook)
function verifySignature(req) {
  if (!GITHUB_WEBHOOK_SECRET) return true; // brak secreta = pomijamy weryfikację

  const signature = req.headers["x-hub-signature-256"];
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", GITHUB_WEBHOOK_SECRET);
  const digest = "sha256=" + hmac.update(req.rawBody).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

// Budowanie ładnej wiadomości na Discorda w zależności od typu eventu
function buildDiscordMessage(event, payload) {
  const repo = payload.repository?.full_name || "nieznane repo";
  const sender = payload.sender?.login || "ktoś";

  switch (event) {
    case "push": {
      const branch = payload.ref?.replace("refs/heads/", "") || "?";
      const commits = payload.commits || [];
      const commitList = commits
        .slice(0, 5)
        .map(
          (c) =>
            `• \`${c.id.slice(0, 7)}\` ${c.message.split("\n")[0]} — ${c.author?.name}`,
        )
        .join("\n");

      return {
        content: null,
        embeds: [
          {
            title: `📦 Push do ${repo} (${branch})`,
            description: commitList || "Brak commitów w payloadzie",
            url: payload.compare,
            color: 0x2ecc71,
            footer: { text: `Wysłane przez ${sender}` },
          },
        ],
      };
    }

    case "pull_request": {
      const pr = payload.pull_request;
      return {
        embeds: [
          {
            title: `🔀 PR ${payload.action}: ${pr.title}`,
            url: pr.html_url,
            description: `**${repo}** — #${pr.number}\n${pr.body?.slice(0, 200) || ""}`,
            color: 0x3498db,
            footer: { text: `Autor: ${pr.user?.login}` },
          },
        ],
      };
    }

    case "issues": {
      const issue = payload.issue;
      return {
        embeds: [
          {
            title: `📝 Issue ${payload.action}: ${issue.title}`,
            url: issue.html_url,
            description: `**${repo}** — #${issue.number}`,
            color: 0xe67e22,
            footer: { text: `Autor: ${issue.user?.login}` },
          },
        ],
      };
    }

    case "star": {
      return {
        embeds: [
          {
            title: `⭐ Nowa gwiazdka dla ${repo}!`,
            description: `Od: **${sender}**`,
            color: 0xf1c40f,
          },
        ],
      };
    }

    default: {
      // Fallback dla dowolnego innego typu eventu - wysyłamy surowe info
      return {
        embeds: [
          {
            title: `📡 GitHub event: ${event}`,
            description: `Repo: **${repo}**\nAkcja: \`${payload.action || "brak"}\``,
            color: 0x95a5a6,
          },
        ],
      };
    }
  }
}

app.post("/webhook/github", async (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).send("Nieprawidłowy podpis");
  }

  const event = req.headers["x-github-event"] || "unknown";
  const payload = req.body;

  // Ping event wysyłany przy dodaniu webhooka - potwierdzamy że działa
  if (event === "ping") {
    console.log("Otrzymano ping od GitHuba - webhook skonfigurowany poprawnie");
    return res.status(200).send("pong");
  }

  const discordMessage = buildDiscordMessage(event, payload);

  try {
    const response = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordMessage),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Discord odrzucił wiadomość:", response.status, text);
      return res.status(502).send("Błąd przy wysyłce do Discorda");
    }

    console.log(
      `Przekazano event "${event}" z ${payload.repository?.full_name} na Discorda`,
    );
    res.status(200).send("OK");
  } catch (err) {
    console.error("Błąd wysyłki do Discorda:", err);
    res.status(500).send("Błąd serwera");
  }
});

// Prosty health check
app.get("/", (req, res) => {
  res.send("GitHub → Discord webhook relay działa ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serwer nasłuchuje na porcie ${PORT}`);
});
