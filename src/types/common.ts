export interface User {
    userId: string;
    username: string;
    isOnline?: boolean;
    isMicActive?: boolean;
    clientId?: string;
    connectionState?: string;
    joinedAt?: string;
}

export interface Message {
    id: string;
    roomId: string;
    text: string;
    type: 'text' | 'image' | 'audio' | 'poll' | 'system';
    userId: string;
    username: string;
    timestamp: string;
    readBy?: string[];
    replyTo?: ReplyTarget;
    reactions?: Record<string, string[]>;
    poll?: Poll;
    forwardedFrom?: ForwardedFrom;
    pollRef?: PollRef;
    embed?: Embed;
    edited?: boolean;
    editedAt?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    audioUrl?: string;
    broadcast?: boolean;
}

export interface ReplyTarget {
    id: string;
    userId: string;
    username: string;
    text: string;
}

export interface Poll {
    question: string;
    options: PollOption[];
    totalVotes: number;
    settings: PollSettings;
    userId?: string;
}

export interface PollOption {
    id: string;
    text: string;
    votes: number;
    voters?: string[];
}

export interface PollSettings {
    multiple: boolean;
    anonymous: boolean;
    maxChoices: number;
    closed: boolean;
    closeAt: string | null;
}

export interface PollRef {
    originalPollId: string;
    originalRoomId: string;
}

export interface ForwardedFrom {
    serverId: string;
    serverName: string;
    roomId: string;
    roomName: string;
    messageId: string;
    username: string;
}

export interface Embed {
    url?: string;
    title?: string;
    description?: string;
    siteName?: string;
    image?: string;
    favicon?: string;
    provider?: string;
    imageData?: {
        thumbnailPath: string;
        localPath: string;
    };
    error?: boolean;
}

export interface Room {
    id: string;
    name: string;
    serverId: string;
    ownerId?: string;
    type?: string;
    members?: string[];
    participantIds?: string[];
    isPrivate?: boolean;
}

export interface Server {
    id: string;
    name: string;
    ownerId?: string;
    type?: string;
    displayName?: string;
    members?: string[];
    participantIds?: string[];
    isPrivate?: boolean;
    inviteCode?: string;
}

export interface Note {
    id: string;
    authorId: string;
    authorName?: string;
    username?: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    reactions?: Record<string, string[]>;
}

export interface ThreadMessage {
    id: string;
    noteId: string;
    userId: string;
    username: string;
    text: string;
    timestamp: string;
    reactions?: Record<string, string[]>;
}
