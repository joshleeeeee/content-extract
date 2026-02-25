
export const content = {
    en: {
        header: {
            brand: "ContentExtract",
            install: "Install",
            features: "Features",
            showcase: "Showcase",
            star: "Star on GitHub",
            repo: "GitHub Repo"
        },
        hero: {
            badge: "v1.8.0 is out now",
            titleStart: "Export Everything with",
            titleEnd: "Content Extractor",
            description: "The ultimate Multi-Source Content Extractor for your browser. v1.8.0 adds dedicated Douyin/Xiaohongshu/Bilibili social-comment extraction with API+DOM hybrid collection, while keeping strong JD/Taobao/Tmall review workflows. From cloud docs and job listings to social and e-commerce comments, effortlessly convert online content into clean Markdown, Rich Text, CSV/JSON, or beautifully bookmarked PDFs.",
            downloadRelease: "Download Release ZIP",
            installHint: "Install manually: open chrome://extensions and load the unzipped folder.",
            exploreFeatures: "Explore Features"
        },
        install: {
            title: "Install in 3 Minutes",
            subtitle: "Recommended for most users: download the release package and load it as an unpacked extension.",
            releaseTitle: "Method A: Release Package (Recommended)",
            releaseSteps: [
                "Open GitHub Releases and download the latest content-extract-v*.zip.",
                "Unzip the package. Make sure the selected folder directly contains manifest.json.",
                "Open chrome://extensions (or edge://extensions) and enable Developer mode.",
                "Click 'Load unpacked' and select the unzipped folder."
            ],
            releaseCta: "Open Releases",
            devTitle: "Method B: Build from Source",
            devSteps: [
                "Clone the repository and open the extension directory.",
                "Run npm ci && npm run build.",
                "Open the extensions page and enable Developer mode.",
                "Click 'Load unpacked' and select extension/dist."
            ],
            devCta: "View Source",
            note: "After each update, download the latest release again and reload the extension."
        },
        features: {
            highlight: "Everything you need.",
            subHighlight: "Powerful features designed for developers, writers, and knowledge workers.",
            list: [
                {
                    title: "Universal Export",
                    description: "Instantly convert online content into perfect Markdown or Rich Text. Preserves formatting, tables, and code blocks."
                },
                {
                    title: "PDF with Bookmarks",
                    description: "One-click export to high-quality PDF with native outline bookmarks auto-generated from H1/H2/H3 headings. Powered by Chrome DevTools Protocol."
                },
                {
                    title: "Multi-Source Support",
                    description: "Intelligent adapters tailored for Feishu/Lark docs, Boss Zhipin jobs, JD/Taobao/Tmall product reviews, and Douyin/Xiaohongshu/Bilibili social comments."
                },
                {
                    title: "Smart Image Handling",
                    description: "Choose between Local ZIP bundling, Base64 embedding, or automatic cloud upload to OSS/MinIO/S3."
                },
                {
                    title: "Automated Batching",
                    description: "Automatically identifies docs or product links on any page. Scan once and batch export with task-aware formats including Markdown, PDF, CSV, and JSON."
                },
                {
                    title: "Smart Content Merging",
                    description: "Intelligently merge multiple results into a single clean document, perfecting your knowledge organization."
                },
                {
                    title: "Clean & Semantic",
                    description: "Generates high-quality Markdown compatible with Obsidian, Notion, Logseq, and static site generators."
                },
                {
                    title: "Privacy Focused",
                    description: "Runs entirely in your browser. Your data remains yours—no cloud processing required."
                },
                {
                    title: "Task Manager",
                    description: "Built-in manager to track progress, history, and archives. v1.8.0 adds platform-aware review hints, richer progress rounds, quick download, and quality preview for CSV/JSON tasks."
                }
            ]
        },
        showcase: {
            title: "Universal & Powerful Workflow",
            subtitle: "See how easy it is to capture and export web content.",
            step1: {
                title: "Auto-Detect & Scan",
                description: "The extension instantly recognizes the platform and activates the correct extraction engine. One click to scan all possible targets.",
                point1: "Adaptive extraction",
                point2: "Batch target recognition"
            },
            step2: {
                title: "Unified Task Center",
                description: "Monitor multiple capture tasks in real-time. Choose to export as individual files, a ZIP archive, or a merged document.",
                point1: "Flexible export modes",
                point2: "Persistent task queue"
            },
            step3: {
                title: "Advanced Customization",
                description: "Fine-tune your output. From image hosting to format specifics, customize how you own your web content.",
                point1: "Automated Image Hosting",
                point2: "Developer-friendly output"
            }
        },
        footer: {
            brandDescription: "Open-source tool designed to liberate your documentation. Built with precision and care.",
            privacy: "Privacy Policy",
            terms: "Terms of Service",
            sponsor: "Sponsor",
            rights: "ContentExtract. All rights reserved. Independence through open source.",
            disclaimer: {
                title: "Legal Disclaimer",
                text: "This extension is for educational and personal research purposes ONLY. By using this tool, you assume all risks and liabilities. The developer is NOT responsible for any account bans, data loss, or legal consequences resulting from the use of this project. Use it at your own risk."
            }
        }
    },
    zh: {
        header: {
            brand: "多源内容提取器",
            install: "安装教程",
            features: "功能特性",
            showcase: "演示流程",
            star: "Star on GitHub",
            repo: "GitHub 仓库"
        },
        hero: {
            badge: "v1.8.0 现已发布",
            titleStart: "使用多源内容提取器",
            titleEnd: "万物皆可导出",
            description: "这是专为浏览器打造的强大的多源内容提取器 (Extractor)。v1.8.0 新增抖音/小红书/B站评论抓取能力，支持 API+DOM 组合抓取、回复展开与前台滚动增量提取，并延续京东/淘宝/天猫电商评论能力。从云端文档、招聘信息到社媒与商品评论，一键将碎片内容转化为 Markdown、富文本、CSV/JSON 或高品质 PDF。",
            downloadRelease: "下载 Release 安装包",
            installHint: "下载后在 chrome://extensions 开启开发者模式，加载解压后的扩展目录。",
            exploreFeatures: "探索功能"
        },
        install: {
            title: "3 分钟完成安装",
            subtitle: "普通用户推荐使用 Release 安装包；开发者可按源码构建方式安装。",
            releaseTitle: "方式 A：Release 安装包（推荐）",
            releaseSteps: [
                "打开 GitHub Releases，下载最新的 content-extract-v*.zip。",
                "解压压缩包，并确认要选择的目录内直接包含 manifest.json。",
                "打开 chrome://extensions（或 edge://extensions），开启开发者模式。",
                "点击“加载解压的扩展程序”，选择解压后的目录。"
            ],
            releaseCta: "打开 Releases",
            devTitle: "方式 B：源码构建安装",
            devSteps: [
                "Clone 仓库后进入 extension 目录。",
                "执行 npm ci && npm run build。",
                "打开扩展管理页并开启开发者模式。",
                "点击“加载解压的扩展程序”，选择 extension/dist。"
            ],
            devCta: "查看源码",
            note: "版本更新后请重新下载最新 Release，并在扩展管理页重新加载。"
        },
        features: {
            highlight: "核心功能，一应俱全",
            subHighlight: "专为开发者、写作者和知识管理爱好者打造。",
            list: [
                {
                    title: "全能转换",
                    description: "毫秒级将在线内容转换为完美的 Markdown 或富文本，保留表格、代码块及复杂排版。"
                },
                {
                    title: "PDF 导出与书签",
                    description: "一键导出为高质量 PDF，自动根据 H1/H2/H3 标题生成原生 PDF 书签目录。基于 Chrome DevTools Protocol，矢量文字可搜索可选中。"
                },
                {
                    title: "多平台兼容",
                    description: "预置飞书/Lark、BOSS直聘，以及京东/淘宝/天猫/抖音/小红书/B站评论抓取适配器，持续扩展更多主流内容平台。"
                },
                {
                    title: "智能图片处理",
                    description: "支持本地 ZIP 打包、Base64 内嵌，或一键上传至 OSS/MinIO/S3 个人图床。"
                },
                {
                    title: "自动化批处理",
                    description: "智能识别页面中的可提取目标。一键扫描后按任务类型选择导出格式，支持 Markdown/PDF 以及评论场景的 CSV/JSON。"
                },
                {
                    title: "智能内容合并",
                    description: "支持将多个抓取结果自动合并为一个逻辑清晰的文档，让碎片信息更具体系化。"
                },
                {
                    title: "语义化输出",
                    description: "生成高标准的纯净 Markdown，无缝对接 Obsidian、Notion 及静态网站生成器。"
                },
                {
                    title: "隐私安全",
                    description: "所有处理逻辑均在本地完成，保护您的数据隐私，不经过任何第三方服务器。"
                },
                {
                    title: "现代下载中心",
                    description: "内置任务管理器，支持持久化历史记录与 ZIP 归档。v1.8.0 新增平台化评论任务提示、轮次进度与质检预览，轻松掌控你的所有导出任务。"
                }
            ]
        },
        showcase: {
            title: "全通用、更高效的提取流程",
            subtitle: "不仅是搬运工，更是您的生产力伴侣。",
            step1: {
                title: "感知检测与扫描",
                description: "插件自动识别网页平台并激活对应引擎。一键扫描页面中所有的目标链接或信息卡片。",
                point1: "平台自适应引擎",
                point2: "批量目标极速提取"
            },
            step2: {
                title: "任务管理大厅",
                description: "统一监控多个抓取任务的实时进度。支持导出为独立文件、ZIP 压缩包或智能合并文档。",
                point1: "灵活多样的导出模式",
                point2: "持久化任务队列"
            },
            step3: {
                title: "个性化高级配置",
                description: "深度定制你的输出需求。从图片托管策略到格式微调，一切尽在掌控。",
                point1: "自动化图床配置",
                point2: "开发者模式支持"
            }
        },
        footer: {
            brandDescription: "开源工具，旨在解放你的在线数据。用心打造。",
            privacy: "隐私政策",
            terms: "服务条款",
            sponsor: "赞助作者",
            rights: "ContentExtract. 保留所有权利. 保持独立，拥抱开源.",
            disclaimer: {
                title: "免责声明",
                text: "本插件仅供技术研究、学术探讨以及个人备份自用。请勿将本插件用于任何商业用途、大规模非法抓取、侵犯版权或其他违反法律法规的行为。用户在使用本插件时，必须遵守所在地区法律法规及对应文档平台的服务条款。由此产生的任何个人账号封禁、合规性风险或法律责任，均由使用者自行承担，开发者概不负责。"
            }
        }
    }
};
