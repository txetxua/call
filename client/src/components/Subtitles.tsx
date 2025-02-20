import { type SubtitlesConfig } from "./SubtitlesConfig";

interface Props {
  transcript: string;
  config: SubtitlesConfig;
}

export default function Subtitles({ transcript, config }: Props) {
  if (!transcript) {
    return null;
  }

  const subtitleStyle = {
    fontSize: `${config.fontSize}px`,
    fontFamily: config.fontFamily,
    color: config.color,
    textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
    maxWidth: "80%",
    margin: "0 auto",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    padding: "8px 12px",
    borderRadius: "4px",
    lineHeight: "1.5",
    whiteSpace: "pre-wrap",
    wordWrap: "break-word",
    zIndex: 50,
  } as const;

  return (
    <div className="text-center relative" style={subtitleStyle}>
      {transcript}
    </div>
  );
}