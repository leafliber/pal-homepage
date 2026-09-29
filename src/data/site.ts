const configuredUrl = process.env.SITE_URL?.trim();
if (configuredUrl) {
  const url = new URL(configuredUrl);
  if (
    url.protocol !== "https:" ||
    /^(localhost|127\.|example\.)/.test(url.hostname) ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "SITE_URL must be the real public HTTPS origin, without a path.",
    );
  }
}

export const site = {
  name: "Pal AI Lab",
  title: "Pal AI Lab — 做最好的开源人格 AI",
  description:
    "做最好的开源人格 AI。Bring your AI to the world! 把最新的 AI 技术变成你身边触手可及的伙伴。",
  url: configuredUrl ? new URL(configuredUrl).origin : undefined,
  github: "https://github.com/Pal-AI-Lab",
  contribute: "https://github.com/Pal-AI-Lab/Cortico/blob/main/CONTRIBUTING.md",
} as const;
