import { VoiceChatClient } from '../VoiceChatClient';

declare global {
    interface Window {
        voiceClient: VoiceChatClient;
        _voiceClientInstance: VoiceChatClient;
        producerUserMap: Map<string, string>;
        producerClientMap: Map<string, string>;
        mediasoupClient: any;
        Prism: any;
        PollWidget: any;
        ScrollTracker: any;
        ELECTRON_CUSTOM_SOUNDS_ENABLED?: boolean;
        ipcRenderer?: any;
        electronAPI?: {
            updateTrayBadge: (count: number) => void;
        };
        mobileFix: {
            setVH: () => void;
            isIOS: boolean;
            isAndroid: boolean;
        };
    }
}

export {};
