import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Settings } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";

const DEFAULT_CONFIG = {
  fontSize: 24,
  fontFamily: "sans",
  color: "white",
};

export type SubtitlesConfig = typeof DEFAULT_CONFIG;

const FONT_FAMILIES = [
  { value: "sans", label: "Sans Serif" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Monospace" },
];

const COLORS = [
  { value: "white", label: "Blanco" },
  { value: "yellow", label: "Amarillo" },
  { value: "green", label: "Verde" },
];

interface Props {
  onChange: (config: SubtitlesConfig) => void;
}

export default function SubtitlesConfig({ onChange }: Props) {
  const [config, setConfig] = useState<SubtitlesConfig>(() => {
    const saved = localStorage.getItem("subtitlesConfig");
    return saved ? JSON.parse(saved) : DEFAULT_CONFIG;
  });

  useEffect(() => {
    localStorage.setItem("subtitlesConfig", JSON.stringify(config));
    onChange(config);
  }, [config, onChange]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="absolute top-4 left-4 z-10"
          title="Configurar subtítulos"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configuración de Subtítulos</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label>Tamaño de fuente</Label>
            <Slider
              value={[config.fontSize]}
              onValueChange={([value]) => setConfig((prev) => ({ ...prev, fontSize: value }))}
              min={16}
              max={48}
              step={2}
            />
            <div className="text-sm text-muted-foreground text-right">
              {config.fontSize}px
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tipo de fuente</Label>
            <Select
              value={config.fontFamily}
              onValueChange={(value) => setConfig((prev) => ({ ...prev, fontFamily: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    {font.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <Select
              value={config.color}
              onValueChange={(value) => setConfig((prev) => ({ ...prev, color: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLORS.map((color) => (
                  <SelectItem key={color.value} value={color.value}>
                    {color.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4 p-4 border rounded-lg">
            <div className="text-center" style={{
              fontSize: `${config.fontSize}px`,
              fontFamily: config.fontFamily,
             