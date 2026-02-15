export type PlatformId = 'feishu' | 'boss' | 'jd' | 'taobao' | 'douyin' | 'xiaohongshu' | 'bilibili'

export type TaskType = 'doc' | 'review'

export type ExportFormat = 'markdown' | 'html' | 'pdf' | 'csv' | 'json'

type PlatformTaskTypeMap = {
    feishu: 'doc'
    boss: 'doc'
    jd: 'review'
    taobao: 'review'
    douyin: 'review'
    xiaohongshu: 'review'
    bilibili: 'review'
}

type PlatformTaskType<P extends PlatformId> = PlatformTaskTypeMap[P]

export interface PlatformCapabilities {
    supportsScanLinks: boolean
    supportsScrollScan: boolean
    supportsPdf: boolean
}

export interface PlatformProfile<P extends PlatformId = PlatformId> {
    id: P
    taskType: PlatformTaskType<P>
    label: string
    supportMessage: string
    hostMatchers: string[]
    defaults: {
        mergeBatch: boolean
    }
    capabilities: PlatformCapabilities
}

export interface PlatformUiState {
    singleFormats: ExportFormat[]
    showBatchShortcut: boolean
    showBatchTab: boolean
    allowSingleActions: boolean
}

export interface PlatformPageContext {
    platform: PlatformProfile
    supportMessage: string
    ui: PlatformUiState
}

interface PlatformPagePolicyRule {
    when: (parsedUrl: URL) => boolean
    supportMessage?: string
    ui?: Partial<PlatformUiState>
}

interface PlatformPagePolicy {
    supportMessage?: string
    ui?: Partial<PlatformUiState>
    rules?: PlatformPagePolicyRule[]
}

const definePlatformProfile = <P extends PlatformId>(profile: PlatformProfile<P>): PlatformProfile<P> => profile

const REVIEW_SINGLE_FORMATS: ExportFormat[] = ['csv', 'json']

export const TASK_TYPE_DEFAULT_SINGLE_FORMATS: Record<TaskType, ExportFormat[]> = {
    doc: ['markdown', 'html', 'pdf'],
    review: REVIEW_SINGLE_FORMATS
}

export function getDefaultSingleFormats(taskType: TaskType): ExportFormat[] {
    return [...TASK_TYPE_DEFAULT_SINGLE_FORMATS[taskType]]
}

export const PLATFORM_REGISTRY: PlatformProfile[] = [
    definePlatformProfile({
        id: 'feishu',
        taskType: 'doc',
        label: '飞书/Lark 文档',
        supportMessage: '支持导出：飞书/Lark 文档',
        hostMatchers: ['feishu.cn', 'larksuite.com'],
        defaults: {
            mergeBatch: false
        },
        capabilities: {
            supportsScanLinks: true,
            supportsScrollScan: true,
            supportsPdf: true
        }
    }),
    definePlatformProfile({
        id: 'boss',
        taskType: 'doc',
        label: 'BOSS 直聘职位',
        supportMessage: '支持导出：BOSS 直聘职位',
        hostMatchers: ['zhipin.com'],
        defaults: {
            mergeBatch: true
        },
        capabilities: {
            supportsScanLinks: true,
            supportsScrollScan: false,
            supportsPdf: true
        }
    }),
    definePlatformProfile({
        id: 'jd',
        taskType: 'review',
        label: '京东商品评论',
        supportMessage: '支持导出：京东/淘宝商品评论',
        hostMatchers: ['jd.com', 'jd.hk'],
        defaults: {
            mergeBatch: true
        },
        capabilities: {
            supportsScanLinks: true,
            supportsScrollScan: true,
            supportsPdf: true
        }
    }),
    definePlatformProfile({
        id: 'taobao',
        taskType: 'review',
        label: '淘宝/天猫商品评论',
        supportMessage: '支持导出：京东/淘宝商品评论',
        hostMatchers: ['taobao.com', 'tmall.com'],
        defaults: {
            mergeBatch: true
        },
        capabilities: {
            supportsScanLinks: true,
            supportsScrollScan: true,
            supportsPdf: true
        }
    }),
    definePlatformProfile({
        id: 'douyin',
        taskType: 'review',
        label: '抖音评论',
        supportMessage: '支持导出：抖音评论',
        hostMatchers: ['douyin.com'],
        defaults: {
            mergeBatch: true
        },
        capabilities: {
            supportsScanLinks: true,
            supportsScrollScan: true,
            supportsPdf: false
        }
    }),
    definePlatformProfile({
        id: 'xiaohongshu',
        taskType: 'review',
        label: '小红书评论',
        supportMessage: '支持导出：小红书评论',
        hostMatchers: ['xiaohongshu.com', 'xhslink.com'],
        defaults: {
            mergeBatch: true
        },
        capabilities: {
            supportsScanLinks: true,
            supportsScrollScan: true,
            supportsPdf: false
        }
    }),
    definePlatformProfile({
        id: 'bilibili',
        taskType: 'review',
        label: 'B站评论',
        supportMessage: '支持导出：B站评论',
        hostMatchers: ['bilibili.com', 'b23.tv'],
        defaults: {
            mergeBatch: true
        },
        capabilities: {
            supportsScanLinks: true,
            supportsScrollScan: true,
            supportsPdf: false
        }
    })
]

const normalize = (value: string) => value.trim().toLowerCase()

const isHostMatch = (hostname: string, matcher: string) => {
    return hostname === matcher || hostname.endsWith(`.${matcher}`)
}

const createDefaultUiState = (platform: PlatformProfile): PlatformUiState => {
    return {
        singleFormats: getDefaultSingleFormats(platform.taskType),
        showBatchShortcut: platform.capabilities.supportsScanLinks,
        showBatchTab: platform.capabilities.supportsScanLinks,
        allowSingleActions: true
    }
}

const applyUiPatch = (ui: PlatformUiState, patch?: Partial<PlatformUiState>): PlatformUiState => {
    if (!patch) return ui
    return {
        ...ui,
        ...patch,
        singleFormats: patch.singleFormats ? [...patch.singleFormats] : ui.singleFormats
    }
}

const isJdProductDetailUrl = (parsedUrl: URL) => {
    const host = parsedUrl.hostname.toLowerCase()
    const pathname = parsedUrl.pathname.toLowerCase()
    const isItemHost = host.startsWith('item.') || host.startsWith('item-')
    return isItemHost && (host.includes('jd.com') || host.includes('jd.hk')) && /\/(?:product\/)?\d+\.html$/.test(pathname)
}

const isTaobaoProductDetailUrl = (parsedUrl: URL) => {
    const host = parsedUrl.hostname.toLowerCase()
    const pathname = parsedUrl.pathname.toLowerCase()
    const isDetailHost = host.includes('item.taobao.com') || host.includes('detail.tmall.com') || host.includes('chaoshi.detail.tmall.com')
    return isDetailHost && pathname.endsWith('/item.htm') && /^\d+$/.test(parsedUrl.searchParams.get('id') || '')
}

const isDouyinDetailUrl = (parsedUrl: URL) => {
    const host = parsedUrl.hostname.toLowerCase()
    if (!host.includes('douyin.com')) return false
    const pathname = parsedUrl.pathname.toLowerCase()
    const modalId = (parsedUrl.searchParams.get('modal_id') || '').trim()
    return /\/video\/\d+(?:\/)?$/.test(pathname) || /^\d+$/.test(modalId)
}

const isXiaohongshuDetailUrl = (parsedUrl: URL) => {
    const host = parsedUrl.hostname.toLowerCase()
    if (!host.includes('xiaohongshu.com')) return false
    const pathname = parsedUrl.pathname.toLowerCase()
    return /\/(explore|discovery\/item)\/[a-z0-9_-]+(?:\/)?$/i.test(pathname)
}

const isBilibiliDetailUrl = (parsedUrl: URL) => {
    const host = parsedUrl.hostname.toLowerCase()
    if (!host.includes('bilibili.com')) return false
    const pathname = parsedUrl.pathname.toLowerCase()
    return /\/video\/(bv[a-z0-9]+|av\d+)(?:\/)?$/i.test(pathname)
}

const isDouyinShortUrl = (parsedUrl: URL) => parsedUrl.hostname.toLowerCase() === 'v.douyin.com'

const isXiaohongshuShortUrl = (parsedUrl: URL) => parsedUrl.hostname.toLowerCase() === 'xhslink.com'

const isBilibiliShortUrl = (parsedUrl: URL) => parsedUrl.hostname.toLowerCase() === 'b23.tv'

const createCommerceReviewPolicy = (platformName: string, isDetailPage: (parsedUrl: URL) => boolean): PlatformPagePolicy => {
    return {
        rules: [
            {
                when: isDetailPage,
                supportMessage: `当前是${platformName}商品详情页，可直接抓取评论 CSV / JSON`,
                ui: {
                    singleFormats: [...REVIEW_SINGLE_FORMATS],
                    showBatchShortcut: false,
                    showBatchTab: true,
                    allowSingleActions: true
                }
            },
            {
                when: () => true,
                supportMessage: `当前不是${platformName}商品详情页。请进入商品详情页后单页抓取，或前往批量页粘贴多个商品详情链接（无需先打开列表页）`,
                ui: {
                    singleFormats: [...REVIEW_SINGLE_FORMATS],
                    showBatchShortcut: true,
                    showBatchTab: true,
                    allowSingleActions: false
                }
            }
        ]
    }
}

const createSocialReviewPolicy = (
    platformName: string,
    isDetailPage: (parsedUrl: URL) => boolean,
    isShortLinkPage?: (parsedUrl: URL) => boolean
): PlatformPagePolicy => {
    return {
        rules: [
            {
                when: isDetailPage,
                supportMessage: `当前是${platformName}内容详情页，可直接抓取评论 CSV / JSON`,
                ui: {
                    singleFormats: [...REVIEW_SINGLE_FORMATS],
                    showBatchShortcut: true,
                    showBatchTab: true,
                    allowSingleActions: true
                }
            },
            {
                when: (parsedUrl) => !!isShortLinkPage && isShortLinkPage(parsedUrl),
                supportMessage: `检测到${platformName}短链，开始抓取后会自动跳转到详情页并继续提取评论`,
                ui: {
                    singleFormats: [...REVIEW_SINGLE_FORMATS],
                    showBatchShortcut: true,
                    showBatchTab: true,
                    allowSingleActions: true
                }
            },
            {
                when: () => true,
                supportMessage: `当前不是${platformName}内容详情页。请进入详情页后单页抓取，或前往批量页扫描/粘贴多个详情链接`,
                ui: {
                    singleFormats: [...REVIEW_SINGLE_FORMATS],
                    showBatchShortcut: true,
                    showBatchTab: true,
                    allowSingleActions: false
                }
            }
        ]
    }
}

const PLATFORM_PAGE_POLICIES: Partial<Record<PlatformId, PlatformPagePolicy>> = {
    jd: createCommerceReviewPolicy('京东', isJdProductDetailUrl),
    taobao: createCommerceReviewPolicy('淘宝/天猫', isTaobaoProductDetailUrl),
    douyin: createSocialReviewPolicy('抖音', isDouyinDetailUrl, isDouyinShortUrl),
    xiaohongshu: createSocialReviewPolicy('小红书', isXiaohongshuDetailUrl, isXiaohongshuShortUrl),
    bilibili: createSocialReviewPolicy('B站', isBilibiliDetailUrl, isBilibiliShortUrl)
}

export function detectPlatformByHostname(hostname: string): PlatformProfile | null {
    const normalizedHostname = normalize(hostname)
    if (!normalizedHostname) return null

    for (const platform of PLATFORM_REGISTRY) {
        if (platform.hostMatchers.some((matcher) => isHostMatch(normalizedHostname, matcher))) {
            return platform
        }
    }

    return null
}

export function detectPlatformByUrl(url: string): PlatformProfile | null {
    try {
        const parsed = new URL(url)
        return detectPlatformByHostname(parsed.hostname)
    } catch (_) {
        return detectPlatformByHostname(url)
    }
}

export function detectPlatformPageContextByUrl(url: string): PlatformPageContext | null {
    let parsedUrl: URL
    try {
        parsedUrl = new URL(url)
    } catch (_) {
        return null
    }

    const platform = detectPlatformByHostname(parsedUrl.hostname)
    if (!platform) return null

    let supportMessage = platform.supportMessage
    let ui = createDefaultUiState(platform)

    const policy = PLATFORM_PAGE_POLICIES[platform.id]
    if (policy) {
        if (policy.supportMessage) supportMessage = policy.supportMessage
        ui = applyUiPatch(ui, policy.ui)

        const matchedRule = policy.rules?.find((rule) => rule.when(parsedUrl))
        if (matchedRule) {
            if (matchedRule.supportMessage) supportMessage = matchedRule.supportMessage
            ui = applyUiPatch(ui, matchedRule.ui)
        }
    }

    return {
        platform,
        supportMessage,
        ui
    }
}
