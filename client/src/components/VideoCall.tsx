import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { WebRTCConnection } from "@/lib/webrtc";
import { SpeechHandler } from "@/lib/speech";
import { type Language } from "@shared/schema";
import CallControls from "@/components/CallControls";
import Subtitles from "@/components/Subtitles";
import SubtitlesConfig from "@/components/SubtitlesConfig";
import { type SubtitlesConfig as SubtitlesConfigType } from "./SubtitlesConfig";
import { useToast } from "@/hooks/use-toast";

interface Props {
  roomId: string;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

const DEFAULT_SUBTITLES_CONFIG: SubtitlesConfigType = {
  fontSize: 24,
  fontFamily: "sans",
  color: "white",
};

export default function VideoCall({ roomId, language, onLanguageChange }: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcRef = useRef<WebRTCConnection>();
  const speechRef = useRef<SpeechHandler>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Only display the other participant's translations
  const [remoteTranscript, setRemoteTranscript] = useState("");
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>();
  const [subtitlesConfig, setSubtitlesConfig] = useState<SubtitlesConfigType>(DEFAULT_SUBTITLES_CONFIG);
  const [cameraError, setCameraError] = useState<string>();
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;

  // Timer to clear subtitles
  const timerRef = useRef<NodeJS.Timeout>();

  const clearTranscriptAfterDelay = (delay: number = 5000) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setRemoteTranscript("");
    }, delay);
  };

  useEffect(() => {
    let mounted = true;

    const handleSpeechResult = (text: string, isLocal: boolean) => {
      // Only display remote transcripts
      if (!isLocal) {
        console.log("[VideoCall] Remote transcript received:", text);
        setRemoteTranscript(text);
        clearTranscriptAfterDelay();
      }
    };

    const speech = new SpeechHandler(
      roomId,
      language,
      handleSpeechResult,
      (error: Error) => {
        if (!mounted) return;
        console.error("[VideoCall] Speech error:", error);
        toast({
          variant: "destructive",
          title: "Error in speech recognition",
          description: error.message,
        });
      }
    );

    const handleError = async (error: Error) => {
      if (!mounted) return;
      console.error("[VideoCall] Error:", error);

      if (error.name === 'NotAllowedError') {
        setCameraError('Permission to access the camera or microphone has not been granted');
      } else if (error.name === 'NotFoundError') {
        setCameraError('No camera or microphone found');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setCameraError('The device is in use by another application');
      } else {
        setCameraError(error.message);
      }

      if (retryCount < maxRetries &&
          (error.name === 'NotReadableError' ||
           error.name === 'TrackStartError' ||
           error.message.includes('failed to connect'))) {
        setRetryCount(prev => prev + 1);
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (mounted) {
          initializeCall();
        }
      } else {
        toast({
          variant: "destructive",
          title: "Call error",
          description: error.message,
        });
      }
    };

    async function initializeCall() {
      if (!mounted) return;
      try {
        setCameraError(undefined);

        // Release existing tracks
        if (localVideoRef.current?.srcObject) {
          const stream = localVideoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach(track => track.stop());
        }

        // Check devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(device => device.kind === 'videoinput');
        const hasMicrophone = devices.some(device => device.kind === 'audioinput');

        if (!hasCamera && videoEnabled) {
          throw new Error('No camera detected');
        }

        if (!hasMicrophone) {
          throw new Error('No microphone detected');
        }

        // Check permissions
        const permissions = await navigator.mediaDevices.getUserMedia({
          video: videoEnabled,
          audio: true
        });
        permissions.getTracks().forEach(track => track.stop());

        const webrtc = new WebRTCConnection(
          roomId,
          (stream) => {
            if (!mounted) return;
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = stream;
              remoteVideoRef.current.play().catch(console.error);
            }
          },
          (state) => {
            if (!mounted) return;
            console.log("[VideoCall] Connection state:", state);
            setConnectionState(state);

            if (state === 'failed' || state === 'disconnected') {
              toast({
                variant: "destructive",
                title: "Connection error",
                description: "Connection with the other participant lost. Trying to reconnect...",
              });
            } else if (state === 'connected') {
              toast({
                title: "Connected",
                description: "Connection established successfully.",
              });
              setRetryCount(0);
            }
          },
          handleError
        );

        const localStream = await webrtc.start(videoEnabled);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
          localVideoRef.current.play().catch(console.error);
        }

        localStream.getAudioTracks().forEach(track => {
          track.enabled = audioEnabled;
        });
        localStream.getVideoTracks().forEach(track => {
          track.enabled = videoEnabled;
        });

        speech.start();

        webrtcRef.current = webrtc;
        speechRef.current = speech;
      } catch (error) {
        handleError(error as Error);
      }
    }

    initializeCall();

    return () => {
      mounted = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (localVideoRef.current?.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      webrtcRef.current?.close();
      speechRef.current?.stop();
    };
  }, [roomId, language, toast, videoEnabled, audioEnabled, retryCount]);

  const handleHangup = () => {
    if (localVideoRef.current?.srcObject) {
      const stream = localVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    webrtcRef.current?.close();
    speechRef.current?.stop();
    setLocation("/");
  };

  const handleAudioToggle = (enabled: boolean) => {
    setAudioEnabled(enabled);
    const stream = localVideoRef.current?.srcObject as MediaStream;
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  };

  const handleVideoToggle = (enabled: boolean) => {
    setVideoEnabled(enabled);
    const stream = localVideoRef.current?.srcObject as MediaStream;
    if (stream) {
      stream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex-1 relative">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover bg-black/10"
        />

        {cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
            <div className="bg-destructive p-4 rounded-lg">
              {cameraError}
            </div>
          </div>
        )}

        <div className="absolute top-4 right-4 w-48 aspect-video">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover rounded-lg shadow-lg bg-black/10"
          />
        </div>

        <SubtitlesConfig onChange={setSubtitlesConfig} />

        {/* Only show subtitles for remote translations */}
        <div className="absolute bottom-24 left-0 right-0 flex flex-col items-center gap-4 pointer-events-none">
          {remoteTranscript && (
            <Subtitles
              transcript={remoteTranscript}
              config={subtitlesConfig}
            />
          )}
        </div>
      </div>

      <CallControls
        language={language}
        onLanguageChange={onLanguageChange}
        connectionState={connectionState}
        roomId={roomId}
        onHangup={handleHangup}
        audioEnabled={audioEnabled}
        onAudioToggle={handleAudioToggle}
        videoEnabled={videoEnabled}
        onVideoToggle={handleVideoToggle}
      />
    </div>
  );
}