export type SocialPlatformKey = 'douyin' | 'xiaohongshu' | 'bilibili'

export interface SocialCommentItem {
    id: string
    platform: SocialPlatformKey
    contentId: string
    user: string
    userId: string
    userLink: string
    userAvatar: string
    content: string
    likes: number
    time: string
    ipLocation: string
    isReply: boolean
    parentId: string | null
    replyCount: number
    source: string
    crawledAt: string
}

export interface SocialCollectOptions {
    maxCount: number
    maxRounds: number
    idleRoundLimit: number
    includeReplies: boolean
    scrollWaitMs: number
}
