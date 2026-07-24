export type BlogStatus = 'pending' | 'generating' | 'awaiting_review' | 'approved' | 'rejected' | 'posting' | 'posted' | 'error';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export interface BlogRow { row: number; blog_id: string; blog_topic: string; blog_status: BlogStatus; blog_created_date?: string; blog_posted_date?: string; markdown_path?: string; review_status?: ReviewStatus; review_token?: string; review_requested_at?: string; model_used?: string; wordpress_post_id?: string; wordpress_url?: string; last_error?: string; last_updated_at?: string; review_reply_at?: string; }
export interface Message { text: string; receivedAt: string; sender: string; }
export interface MessageAdapter { send(text: string, attachment?: string): Promise<void>; latestReplies(): Promise<Message[]>; }
export interface WordPressPost { id: number; link: string; }
