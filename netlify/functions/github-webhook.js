import crypto from "crypto";

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

// Weryfikacja podpisu X-Hub-Signature-256, żeby nikt obcy nie mógł podszyć się pod GitHuba
function verifySignature(rawBody, signature) {
  if (!GITHUB_WEBHOOK_SECRET) return true; // brak secreta = pomijamy weryfikację
  if (!signature) return false;

  const hmac = crypto.createHmac("sha256", GITHUB_WEBHOOK_SECRET);
  const digest = "sha256=" + hmac.update(rawBody).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch {
    return false; // różne długości bufora itp.
  }
}

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

    case "ping": {
      return {
        embeds: [
          {
            title: `✅ Webhook podłączony pomyślnie!`,
            description: `**${repo}**\nZen: _${payload.zen}_`,
            color: 0x9b59b6,
            footer: { text: `Skonfigurowane przez ${sender}` },
          },
        ],
      };
    }

    default: {
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

// Netlify Functions (format nowszy - "Netlify Functions v2" / standardowy Request/Response)
export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!DISCORD_WEBHOOK_URL) {
    console.error("Brak DISCORD_WEBHOOK_URL w zmiennych środowiskowych!");
    return new Response("Brak konfiguracji serwera", { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature)) {
    return new Response("Nieprawidłowy podpis", { status: 401 });
  }

  const event = req.headers.get("x-github-event") || "unknown";
  const payload = JSON.parse(rawBody);

  if (event === "ping") {
    console.log(
      "Otrzymano ping od GitHuba - webhook skonfigurowany poprawnie, wysyłam potwierdzenie na Discorda",
    );
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
      return new Response("Błąd przy wysyłce do Discorda", { status: 502 });
    }

    console.log(
      `Przekazano event "${event}" z ${payload.repository?.full_name} na Discorda`,
    );
    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Błąd wysyłki do Discorda:", err);
    return new Response("Błąd serwera", { status: 500 });
  }
};
