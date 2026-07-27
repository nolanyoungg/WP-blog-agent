export interface Message { text: string; receivedAt: string; sender: string; }
export interface MessageAdapter { send(text: string, attachment?: string): Promise<void>; latestReplies(): Promise<Message[]>; }
