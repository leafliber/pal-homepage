/**
 * Public project content, verified on 2026-09-29 against the linked READMEs.
 * Edit content here; the site never fetches GitHub at runtime.
 */
export interface ProjectImage {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly sourceUrl: string;
  readonly license: string;
  readonly attributionUrl: string;
}

export interface Project {
  readonly id: "cortico" | "coopanion" | "cortina";
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly href: string;
  readonly sourceUrl: string;
  readonly linkLabel: string;
  readonly image?: ProjectImage;
}

export const contentVerifiedOn = "2026-09-29";

export const organization = {
  name: "Pal AI Lab",
  href: "https://github.com/Pal-AI-Lab",
  description: "让先进的 AI 更容易被使用，也更接近日常生活。",
  contributionHref:
    "https://github.com/Pal-AI-Lab/Cortico/blob/main/CONTRIBUTING.md",
} as const;

export const projects = [
  {
    id: "cortico",
    name: "Cortico",
    tagline: "持续感知，也持续行动。",
    description:
      "围绕事件流构建的 Agent 框架。让持续运行的智能体接入不同环境，感知变化、组织上下文并采取行动。",
    href: "https://github.com/Pal-AI-Lab/Cortico",
    sourceUrl: "https://github.com/Pal-AI-Lab/Cortico/blob/main/README_zh.md",
    linkLabel: "探索 Cortico",
    image: {
      src: "/images/cortico-mark.svg",
      width: 180,
      height: 208,
      alt: "Cortico 官方标识：深色圆弧围绕着一双绿色圆眼。",
      sourceUrl:
        "https://github.com/Pal-AI-Lab/Cortico/blob/c68c489d79a2480983c899a1dd34b20f1b167406/assets/cortico-banner.svg",
      license: "MIT · Copyright (c) 2026 Phantivia",
      attributionUrl: "/images/ATTRIBUTION.txt",
    },
  },
  {
    id: "coopanion",
    name: "Coopanion",
    tagline: "桌面的一角，多一个伙伴。",
    description:
      "基于 Cortico 的桌面伙伴，支持文字、语音交流与经许可的电脑操作。适用于 Windows 和 macOS，需配置模型 API Key。",
    href: "https://github.com/Pal-AI-Lab/Coopanion",
    sourceUrl: "https://github.com/Pal-AI-Lab/Coopanion/blob/main/README.md",
    linkLabel: "认识 Coopanion",
    image: {
      src: "/images/coo.svg",
      width: 256,
      height: 272,
      alt: "Coopanion 的 Coo：白色弧形身体，绿色笑眼，两只短脚。",
      sourceUrl:
        "https://github.com/Pal-AI-Lab/Coopanion/blob/50d0c2c4fd8940c39a181c36bc414df0bd812d77/assets/banner-dark.svg",
      license: "MIT · Copyright (c) 2026 Phantivia",
      attributionUrl: "/images/ATTRIBUTION.txt",
    },
  },
  {
    id: "cortina",
    name: "Cortina",
    tagline: "把想法，变成新的能力。",
    description:
      "用自然语言描述需求，让 Coding Agent 在 Cortina 的指引下编写、测试并检查安装，创建你的 Cortico 扩展。",
    href: "https://github.com/Pal-AI-Lab/Cortina",
    sourceUrl: "https://github.com/Pal-AI-Lab/Cortina/blob/main/README_zh.md",
    linkLabel: "使用 Cortina",
  },
] as const satisfies readonly Project[];
