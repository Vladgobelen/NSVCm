export interface ConsumerState {
    status: 'active' | 'error' | 'recovering';
    consumer: any;
    audioElement: HTMLAudioElement | null;
    lastError: string | null;
    recoveryAttempts?: number;
}

export interface ProducerData {
    id?: string;
    producerId: string;
    clientID?: string;
    userId?: string;
    kind?: string;
}

export interface TransportState {
    id: string;
    connectionState: string;
    closed: boolean;
}

export interface MediaData {
    rtpCapabilities: any;
    sendTransport: {
        id: string;
        iceParameters: any;
        iceCandidates: any[];
        dtlsParameters: any;
    };
    recvTransport: {
        id: string;
        iceParameters: any;
        iceCandidates: any[];
        dtlsParameters: any;
    };
    iceServers?: any[];
}

export interface ConsumerRecoveryState {
    attempts: number;
    nextRetryTimer: ReturnType<typeof setTimeout> | null;
    lastError: string;
    producerData: ProducerData;
    exhausted?: boolean;
}

export interface IceRestartState {
    attempts: number;
    lastAttempt: number;
    state: string;
    nextRetryTimer?: ReturnType<typeof setTimeout> | null;
}

export interface TransportRecoveryState {
    attempts: number;
    timer: ReturnType<typeof setTimeout> | null;
}
