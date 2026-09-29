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
  title: "Pal AI Lab — 让 AI，走进你的世界。",
  description:
    "Pal AI Lab 探索更贴近日常生活的 AI：持续运行的智能体框架 Cortico、桌面伙伴 Coopanion，以及用 Coding Agent 创建扩展的 Cortina。",
  url: configuredUrl ? new URL(configuredUrl).origin : undefined,
  github: "https://github.com/Pal-AI-Lab",
  contribute: "https://github.com/Pal-AI-Lab/Cortico/blob/main/CONTRIBUTING.md",
} as const;
