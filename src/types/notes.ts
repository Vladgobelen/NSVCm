export interface NoteState {
    viewMode: 'chat' | 'personal' | 'public' | 'thread';
    context: {
        type: string | null;
        targetId: string | null;
        noteId: string | null;
    };
}

export interface NoteData {
    id: string;
    type: 'personal' | 'room';
    content: string;
    authorId: string;
    authorName?: string;
    targetId?: string;
    roomId?: string;
    createdAt: string;
    updatedAt: string;
    reactions?: Record<string, string[]>;
}

export interface ThreadMessageData {
    id: string;
    noteId: string;
    userId: string;
    username: string;
    text: string;
    timestamp: string;
    reactions?: Record<string, string[]>;
}
