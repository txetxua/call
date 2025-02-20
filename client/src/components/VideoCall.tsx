import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { WebRTCConnection } from "@/lib/webrtc";
import { SpeechHandler } from "@/lib/speech";
import { type Language } from "@shared/schema";
import CallControls from "@/components/CallControls";
import Subtitles from "@/components/Subtitles";
import SubtitlesConfig from "@/components/SubtitlesConfig";
import { useToast } from "@/hooks/use-toast";
import { Mic } from "lucide-react";

interface Props {
  roomId: string;
  language: Language;
  onLanguageChange: (lang: Language) => void;
}

export default function VideoCall({ roomId, language, onLanguageChange }: Props) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const webrtcRef = useRef<WebRTCConnection>();
  const speechRef = useRef<SpeechHandler>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [error, setError] = useState<string>();
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>();
  const [transcript, setTranscript] = useState<string>("");
  const [isAudioActive, setIsAudioActive] = useState(false);
  const [subtitlesConfig, setSubtitlesConfig] = useState({
    fontSize: 24,
    fontFamily: "sans",
    color: "white",
  });

  useEffect(() => {
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;

    async function setupCall() {
      try {
        console.log("[VideoCall] Setting up call for room:", roomId, "language:", language);

        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        audioContext = new AudioContext();
        const mediaStreamSource = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        mediaStreamSource.connect(analyser);

        const checkAudioActivity = () => {
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          setIsAudioActive(average > 20);
          requestAnimationFrame(checkAudioActivity);
        };
        checkAudioActivity();

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          await localVideoRef.current.play().catch((error) => {
            console.warn("[VideoCall] Local video autoplay failed:", error);
          });
        }

        speechRef.current = new SpeechHandler(
          roomId,
          language,
          (text: string, isLocal: boolean) => {
            console.log("[VideoCall] Transcript received:", { text, isLocal, language });
            setTranscript(text);
          },
          (error: Error) => {
            console.error("[VideoCall] Speech error:", error);
            toast({
              variant: "destructive",
              title: "Error de reconocimiento de voz",
              description: error.message,
            });
          }
        );

        const webrtc = new WebRTCConnection(
          roomId,
          async (remoteStream) => {
            console.log("[VideoCall] Received remote stream");
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
              remoteVideoRef.current.muted = false;
              try {
                await remoteVideoRef.current.play();
              } catch (error) {
                console.warn("[VideoCall] Remote video autoplay failed:", error);
                toast({
                  variant: "destructive",
                  title: "Error de reproducción",
                  description: "No se pudo reproducir el video remoto automáticamente. Intente hacer clic en la pantalla.",
                });
              }
            }
          },
          (state) => {
            console.log("[VideoCall] Connection state:", state);
            setConnectionState(state);
            if (state === "connected") {
              setError(undefined);
              toast({
                title: "Conectado",
                description: "La conexión se ha establecido correctamente",
              });
              speechRef.current?.start();
            } else if (state === "failed" || state === "disconnected") {
              setError("La conexión se ha perdido. Intentando reconectar...");
              speechRef.current?.stop();
            }
          },
          (error) => {
            console.error("[VideoCall] Error:", error);
            setError(error.message);
            toast({
              variant: "destructive",
              title: "Error de conexión",
              description: error.message,
            });
          }
        );

        await webrtc.start(stream);
        webrtcRef.current = webrtc;
        speechRef.current.start();
      } catch (error: any) {
        console.error("[VideoCall] Setup error:", error);
        const errorMessage =
          error.name === "NotAllowedError"
            ? "No se ha permitido el acceso a la cámara y micrófono. Por favor, conceda los permisos necesarios."
            : error.message;

        setError(errorMessage);
        toast({
          variant: "destructive",
          title: "Error",
          description: errorMessage,
        });
      }
    }

    setupCall();

    return () => {
      console.log("[VideoCall] Cleaning up");
      if (webrtcRef.current) {
        webrtcRef.current.close();
      }
      if (speechRef.current) {
        speechRef.current.stop();
      }
      if (analyser) {
        analyser.disconnect();
      }
      if (audioContext) {
        audioContext.close();
      }
    };
  }, [roomId, language, toast]);

  const handleHangup = () => {
    console.log("[VideoCall] Hanging up");
    if (webrtcRef.current) {
      webrtcRef.current.close();
    }
    if (speechRef.current) {
      speechRef.current.stop();
    }
    setLocation("/");
  };

  return (
    <div className="h-screen flex flex-col relative bg-background">
      <div className="absolute inset-0">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover bg-black"
          aria-label="Video remoto"
        />

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
            <div className="bg-destructive p-4 rounded-lg max-w-md text-center">
              {error}
            </div>
          </div>
        )}

        <div className="absolute top-4 right-4 w-48 aspect-video">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover rounded-lg shadow-lg bg-black"
            aria-label="Video local"
          />
          {isAudioActive && (
            <div className="absolute bottom-2 right-2 bg-green-500 p-2 rounded-full">
              <Mic className="h-4 w-4 text-white" />
            </div>
          )}
        </div>

        <SubtitlesConfig onChange={setSubtitlesConfig} />

        <div className="absolute bottom-24 left-0 right-0 flex justify-center">
          <Subtitles transcript={transcript} config={subtitlesConfig} />
        </div>
      </div>

      <CallControls
        language={language}
        onLanguageChange={onLanguageChange}
        connectionState={connectionState}
        roomId={roomId}
        onHangup={handleHangup}
      />
    </div>
  );
}