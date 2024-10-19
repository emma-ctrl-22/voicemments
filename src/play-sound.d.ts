declare module 'play-sound' {
    interface PlayOptions {
        afplay?: string;
        mpg321?: string;
        mplayer?: string;
        mpv?: string;
        play?: string;
        omxplayer?: string;
        cmd?: string;
        player?: string;
    }

    interface PlaySound {
        play: (file: string, options?: PlayOptions, callback?: (err?: Error) => void) => void;
    }

    export default function(options?: PlayOptions): PlaySound;
}
