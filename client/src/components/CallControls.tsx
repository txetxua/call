import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Language } from "@shared/schema";
import { Link, PhoneOff, Video, VideoOff, Mic, MicOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface Props {
  language: Language;
  onLanguageChange: (lang: Language) => void;
  connectionState?: RTCPeerConnectionState;
  roomId: string;
  onHangup: () => void;
}

export default function CallControls({
  language,
  onLanguageChange,
  connectionState,
  roomId,
  onHangup,
}: Props) {
  const { toast } = useToast();
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  const copyRoomLink = () => {
    const url = `${window.location.origin}/call/${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({
        description: "Enlace copiado al portapapeles",
        duration: 2000,
      });
    });
  };

  const toggleVideo = () => {
    const videoTracks = document.querySelector("video")?.srcObject?.getTracks();
    const videoTrack = videoTracks?.find((track) => track.kind === "video");

    if (videoTrack) {
      videoTrack.enabled = !videoEnabled;
      setVideoEnabled(!videoEnabled);
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se encontró el track de video",
      });
    }
  };

  const toggleAudio = () => {
    const audioTracks = document.querySelector("video")?.srcObject?.getTracks();
    const audioTrack = audioTracks?.find((track) => track.kind === "audio");

    if (audioTrack) {
      audioTrack.enabled = !audioEnabled;
      setAudioEnabled(!audioEnabled);
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se encontró el track de audio",
      });
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionState) {
      case "new":
        return "Iniciando...";
      case "connecting":
        return "Conectando...";
      case "connected":
        return "Conectado";
      case "disconnected":
        return "Desconectado";
      case "failed":
        return "Error de conexión";
      case "closed":
        return "Llamada finalizada";
      default:
        return "Conectando...";
    }
  };

  const getConnectionStatusClass = () => {
    switch (connectionState) {
      case "connected":
        return "text-green-500";
      case "failed":
      case "disconnected":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 h-20 bg-black/40 backdrop-blur-sm flex items-center justify-center gap-4 px-4">
      <Select value={language} onValueChange={(value) => onLanguageChange(value as Language)}>
        <SelectTrigger className="w-32 bg-black/60">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="es">Español</SelectItem>
          <SelectItem value="it">Italiano</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="icon"
        onClick={toggleVideo}
        title={videoEnabled ? "Desactivar cámara" : "Activar cámara"}
        className="bg-black/60"
      >
        {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={toggleAudio}
        title={audioEnabled ? "Desactivar micrófono" : "Activar micrófono"}
        className="bg-black/60"
      >
        {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
      </Button>

      <Button
        variant="outline"
        size="icon"
        onClick={copyRoomLink}
        title="Copiar enlace de la llamada"
        className="bg-black/60"
      >
        <Link className="h-4 w-4" />
      </Button>

      <Button
        variant="destructive"
        size="icon"
        onClick={onHangup}
        title="Finalizar llamada"
        className="bg-red-500/80 hover:bg-red-600/80"
      >
        <PhoneOff className="h-4 w-4" />
      </Button>

      <div className={`text-sm font-medium ${getConnectionStatusClass()} text-white/90`}>
        {getConnectionStatusText()}
      </div>
    </div>
  );
}