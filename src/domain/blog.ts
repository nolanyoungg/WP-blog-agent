export type BlogStatus = 'pending' | 'generating' | 'awaiting_review' | 'approved' | 'rejected' | 'posting' | 'posted' | 'error';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type BlogFormatId = string;

export interface BlogRow {
  row: number;
  blog_id: string;
  blog_topic: string;
  blog_length?: number;
  blog_type?: BlogFormatId;
  blog_status: BlogStatus;
  blog_created_date?: string;
  blog_posted_date?: string;
  markdown_path?: string;
  review_status?: ReviewStatus;
  review_token?: string;
  model_used?: string;
  wordpress_post_id?: string;
  wordpress_url?: string;
}

export interface WordPressPost { id: number; link: string; }
