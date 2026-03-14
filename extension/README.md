# ContentExtract 系统设计文档

## 项目概述

ContentExtract 是一个浏览器扩展，支持从在线文档和社交平台批量导出内容为多种格式。

**技术栈**: Vue 3 + TypeScript + Vite + Pinia + TailwindCSS

**核心特性**:
- 插件化架构，易于扩展新平台
- 支持批量导出和并发控制
- 智能内存管理，处理大规模数据
- 混合存储策略，避免配额限制

## 核心功能

### 支持平台

1. **文档类平台**
   - 飞书文档 (Feishu/Lark)
   - Boss直聘 (BOSS)

2. **评论类平台**
   - 京东 (JD)
   - 淘宝/天猫 (Taobao/Tmall)
   - 抖音 (Douyin)
   - 小红书 (Xiaohongshu)
   - B站 (Bilibili)

### 导出格式

- Markdown
- HTML
- PDF
- CSV
- JSON

## 架构设计

### 架构概览（插件化 + 任务中心）

**核心优势**:
- **插件化**: 新平台只需注册插件，无需修改核心代码
- **任务中心**: 统一管理批量任务，支持并发控制和进度追踪
- **分层解耦**: UI、业务逻辑、基础设施清晰分离
- **可测试性**: 每层可独立测试和替换

```
┌──────────────────────────────────────────────────────────────┐
│                     Browser Extension                         │
├──────────────────────────────────────────────────────────────┤
│  UI Layer (Vue 3)              Background Service Worker     │
│  ├─ Popup                      ├─ Task Center                │
│  ├─ Settings                   │   ├─ Commands               │
│  └─ Print Preview              │   ├─ Queries                │
│                                │   └─ Events                 │
│                                ├─ Processor                   │
│                                └─ Runtime State               │
├──────────────────────────────────────────────────────────────┤
│                Content Scripts (Injected)                     │
│                                                               │
│              ┌─────────────────────┐                         │
│              │  Plugin Registry    │                         │
│              └──────────┬──────────┘                         │
│                         │                                     │
│  ┌──────────────────────┴──────────────────────┐            │
│  │                                              │            │
│  ▼              ▼              ▼                ▼            │
│ Feishu        BOSS           JD              Taobao ...      │
│ Plugin        Plugin         Plugin          Plugin          │
│  │              │              │                │            │
│  └──────────────┴──────────────┴────────────────┘            │
│                         │                                     │
│                    BaseAdapter                                │
│                         │                                     │
│                    extract()                                  │
│                         │                                     │
│                    ┌────▼────┐                               │
│                    │ Content │                               │
│                    └─────────┘                               │
├──────────────────────────────────────────────────────────────┤
│                    Infrastructure Layer                       │
│  ├─ Chrome APIs (tabClient, runtimeClient)                   │
│  ├─ Storage Service                                          │
│  └─ Message Contracts                                        │
└──────────────────────────────────────────────────────────────┘
```

### 目录结构

```
src/
├── application/          # 应用层 - 用例和业务流程
│   └── usecases/
│       └── export/       # 导出相关用例
├── background/           # 后台服务脚本
├── components/           # Vue 组件
├── composables/          # Vue 组合式函数
├── content/              # 内容脚本
│   └── adapters/         # 平台适配器
├── infra/                # 基础设施层
│   └── chrome/           # Chrome API 封装
├── popup/                # 弹窗页面
├── print/                # 打印页面
├── shared/               # 共享工具和类型
├── store/                # Pinia 状态管理
└── platformRegistry.ts   # 平台注册表
```

## 核心模块设计

### 1. 平台注册表 (Platform Registry)

**职责**: 管理所有支持的平台配置和能力声明

**核心类型**:
```typescript
type PlatformId = 'feishu' | 'boss' | 'jd' | 'taobao' | 'douyin' | 'xiaohongshu' | 'bilibili'
type TaskType = 'doc' | 'review'
type ExportFormat = 'markdown' | 'html' | 'pdf' | 'csv' | 'json'

interface PlatformProfile {
  id: PlatformId
  taskType: TaskType
  label: string
  supportMessage: string
  hostMatchers: string[]
  defaults: { mergeBatch: boolean }
  capabilities: PlatformCapabilities
}

interface PlatformCapabilities {
  supportsScanLinks: boolean      // 支持扫描链接
  supportsScrollScan: boolean     // 支持滚动扫描
  supportsPdf: boolean            // 支持 PDF 导出
}
```

**设计模式**: 注册表模式 (Registry Pattern)

### 2. 平台适配器 (Platform Adapters)

**职责**: 为每个平台提供内容提取的具体实现

**基类设计**:
```typescript
// 文档类适配器基类
abstract class BaseDocAdapter {
  abstract extract(): Promise<Content>
  abstract getMetadata(): Metadata
}

// 评论类适配器基类
abstract class SocialReviewBaseAdapter {
  abstract scanReviews(): Promise<Review[]>
  abstract scrollToLoad(): Promise<void>
}
```

**具体适配器**:
- `feishu.ts` - 飞书文档适配器
- `boss.ts` - Boss直聘适配器
- `jd-review.ts` - 京东评论适配器
- `taobao-review.ts` - 淘宝评论适配器
- `douyin-review.ts` - 抖音评论适配器
- `xiaohongshu-review.ts` - 小红书评论适配器
- `bilibili-review.ts` - B站评论适配器

**设计模式**: 适配器模式 (Adapter Pattern) + 策略模式 (Strategy Pattern)

### 3. 应用层 (Application Layer)

**职责**: 编排业务流程，协调各层交互

**核心用例**:
- `useBatchExport` - 批量导出用例
  - 管理多个导出任务
  - 协调并发控制
  - 处理导出结果合并

**设计模式**: 用例模式 (Use Case Pattern)

### 4. 基础设施层 (Infrastructure Layer)

**职责**: 封装 Chrome Extension APIs

**核心模块**:
- `runtimeClient.ts` - 消息通信封装
- `tabClient.ts` - 标签页管理封装

**设计原则**: 依赖倒置原则 (DIP)，应用层不直接依赖 Chrome APIs

### 5. 状态管理 (State Management)

**技术**: Pinia

**核心 Store**:
- `settings.ts` - 用户设置状态
- `batch.ts` - 批量操作状态

## 通信机制

### 消息流

```
┌─────────┐         ┌────────────┐         ┌─────────────┐
│  Popup  │────────▶│ Background │────────▶│   Content   │
│   UI    │◀────────│  Service   │◀────────│   Script    │
└─────────┘         └────────────┘         └─────────────┘
    │                                              │
    │                                              │
    └──────────────── Chrome APIs ─────────────────┘
```

**消息类型**:
1. **命令消息** (Popup → Background → Content)
   - 触发导出操作
   - 配置更新通知

2. **状态消息** (Content → Background → Popup)
   - 导出进度更新
   - 错误报告

3. **查询消息** (双向)
   - 获取平台信息
   - 查询导出状态

## 内容提取流程

### 文档类平台 (如飞书)

```
1. 检测页面类型
2. 定位文档容器
3. 遍历 DOM 树
4. 提取结构化内容
   ├─ 标题层级
   ├─ 段落文本
   ├─ 列表项
   ├─ 代码块
   ├─ 表格
   └─ 图片/附件
5. 转换为目标格式
6. 生成下载文件
```

### 评论类平台 (如京东)

```
1. 识别评论容器
2. 滚动加载更多
   ├─ 监听滚动事件
   ├─ 检测加载状态
   └─ 等待新内容渲染
3. 提取评论数据
   ├─ 用户信息
   ├─ 评论内容
   ├─ 评分/点赞
   ├─ 时间戳
   └─ 图片/视频
4. 数据去重
5. 格式化输出
6. 批量导出
```

## 关键技术点

### 1. 动态内容加载

**挑战**: 社交平台使用虚拟滚动和懒加载

**解决方案**:
- 模拟用户滚动行为
- 监听 DOM 变化 (MutationObserver)
- 智能等待策略 (防止过早停止)

### 2. 跨域资源处理

**挑战**: 图片等资源可能跨域

**解决方案**:
- 使用 `host_permissions` 声明权限
- 通过 Background 代理下载
- 转换为 Data URL 或本地引用

### 3. 数据存储策略

**混合存储机制**:

1. **运行时内存存储**
   - `runtimeState` 保存活跃任务和处理结果
   - 提取的完整内容临时存于内存

2. **Chrome Storage 持久化**
   - 存储任务队列状态
   - 存储结果元数据（URL、标题、大小、格式）
   - **不存储完整内容**（避免 10MB 配额限制）

3. **数据流向**
   ```
   Content Script (提取)
       ↓ 消息传递
   Background (内存暂存)
       ↓ 持久化元数据
   Chrome Storage
       ↓ 用户触发导出
   直接下载到本地文件系统
   ```

4. **大文件处理**
   - 分卷策略：单卷最大 300MB
   - Base64 编码传输图片/PDF
   - ZIP 打包本地归档模式

### 4. 大批量数据处理

**挑战**: 导出大量评论可能导致内存溢出

**解决方案**:
- 流式处理，分批导出
- 使用 JSZip 压缩打包
- 及时释放已处理数据

### 5. 平台反爬虫对抗

**挑战**: 平台可能检测自动化行为

**解决方案**:
- 模拟真实用户行为
- 随机延迟
- 限制请求频率

## 快速开始

### 开发环境

```bash
npm install
npm run dev
```

### 生产构建

```bash
npm run build
```

构建工具：Vite + @crxjs/vite-plugin
输出目录：`dist/`

### 加载到浏览器

1. 打开 `chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `dist/` 目录

## 权限说明

```json
{
  "permissions": [
    "activeTab",        // 访问当前标签页
    "scripting",        // 注入脚本
    "clipboardWrite",   // 写入剪贴板
    "storage",          // 本地存储
    "unlimitedStorage", // 无限存储
    "debugger",         // 调试器 API (用于高级功能)
    "downloads"         // 下载文件
  ]
}
```

## 扩展指南

### 添加新平台

1. 在 `platformRegistry.ts` 注册平台配置
2. 在 `content/adapters/` 创建适配器类
3. 在 `manifest.json` 添加匹配规则和权限

### 添加新导出格式

1. 在 `ExportFormat` 类型添加格式
2. 实现格式转换器
3. 更新 UI 选项

## 测试与优化

### 测试策略

- **单元测试**: 工具函数、数据转换逻辑
- **集成测试**: 平台适配器、消息通信
- **E2E 测试**: 完整导出流程、多平台兼容性

### 性能优化

- 懒加载平台适配器
- 虚拟滚动优化大列表
- Web Worker 处理重计算
- 缓存已提取内容
- 增量更新变化部分

## 安全与合规

- **内容安全策略**: 防止 XSS 攻击
- **权限最小化**: 仅申请必要权限
- **数据隔离**: 平台数据隔离存储
- **隐私保护**: 避免导出敏感信息

## 未来规划

- 支持更多平台（知乎、微信公众号等）
- 云端同步功能
- 自定义导出模板
- AI 辅助内容整理
- 浏览器兼容性扩展（Firefox, Edge）

## 贡献指南

欢迎提交 Issue 和 Pull Request！
