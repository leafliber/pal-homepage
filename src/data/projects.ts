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
  description: "致力于做最好的开源人格 AI，把最新的 AI 技术变成身边触手可及的伙伴。",
  contributionHref:
    "https://github.com/Pal-AI-Lab/Cortico/blob/main/CONTRIBUTING.md",
} as const;

export const projects = [
  {
    id: "cortico",
    name: "Cortico",
    tagline: "持续运行的智能体框架。",
    description:
      "用于持续运行智能体的事件驱动框架，支持事件接收、上下文管理与任务处理。Coopanion 基于该框架构建。",
    href: "https://github.com/Pal-AI-Lab/Cortico",
    sourceUrl: "https://github.com/Pal-AI-Lab/Cortico/blob/main/README_zh.md",
    linkLabel: "查看仓库",
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
    tagline: "支持文字与语音交流的桌面 AI 伙伴。",
    description:
      "基于 Cortico 的桌面 AI 伙伴，支持文字、语音交流及经授权的电脑操作。适用于 Windows 和 macOS，需配置模型 API Key。",
    href: "https://github.com/Pal-AI-Lab/Coopanion",
    sourceUrl: "https://github.com/Pal-AI-Lab/Coopanion/blob/main/README.md",
    linkLabel: "查看仓库",
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
    tagline: "面向 Cortico 的扩展开发工具。",
    description:
      "用于创建 Cortico 扩展。根据自然语言需求，由 Coding Agent 完成代码编写、测试与安装检查。",
    href: "https://github.com/Pal-AI-Lab/Cortina",
    sourceUrl: "https://github.com/Pal-AI-Lab/Cortina/blob/main/README_zh.md",
    linkLabel: "查看仓库",
  },
] as const satisfies readonly Project[];
