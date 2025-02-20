import { type Language } from "@shared/schema";

type TranslationCallback = (text: string, isLocal: boolean) => void;
type ErrorCallback = (error: Error) => void;

export class TranslationHandler {
  private eventSource: EventSource | null = null;
  private reconnectTimer?: number;
  private retryCount = 0;
  private maxRetries = 3;

  constructor(
    private roomId: string,
    private language: Language,
    private onTranslation: TranslationCallback,
    private onError?: ErrorCallback
  ) {
    console.log("[Translations] Starting for room:", roomId, "language:", language);
    this.connect();
  }

  private connect() {
    try {
      this.cleanup();

      const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
      const sseUrl = new URL(`${protocol}//${window.location.host}/api/translations/stream/${this.roomId}`);
      sseUrl.searchParams.set('language', this.language);

      console.log("[Translations] Connecting to:", sseUrl.toString());
      this.eventSource = new EventSource(sseUrl.toString());

      this.eventSource.addEventListener('connected', (event) => {
        console.log("[Translations] SSE Connected:", event.data);
        this.retryCount = 0;
      });

      this.eventSource.addEventListener('message', (event) => {
        try {
          console.log("[Translations] Message received:", event.data);
          const message = JSON.parse(event.data);

          if (message.type === 'translation') {
            const isLocal = message.from === this.language;
            const text = this.language === message.to ? message.translated : message.text;

            console.log("[Translations] Processing:", {
              text,
              from: message.from,
              to: message.to,
              selectedLanguage: this.language,
              isLocal
            });

            this.onTranslation(text, isLocal);
          }
        } catch (error) {
          console.error("[Translations] Message processing error:", error);
          this.onError?.(error as Error);
        }
      });

      this.eventSource.onerror = (error) => {
        console.error("[Translations] SSE error:", error);

        if (this.retryCount < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, this.retryCount), 5000);
          this.retryCount++;

          console.log(`[Translations] Reconnecting (${this.retryCount}/${this.maxRetries}) in ${delay}ms`);

          if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
          }

          this.reconnectTimer = window.setTimeout(() => {
            this.connect();
          }, delay);
        } else {
          const error = new Error("No se pudo establecer la conexión para las traducciones");
          console.error("[Translations] Connection failed:", error);
          this.onError?.(error);
        }
      };

    } catch (error) {
      console.error("[Translations] Setup error:", error);
      this.onError?.(error as Error);
    }
  }

  async translate(text: string) {
    if (!text.trim()) return;

    try {
      console.log("[Translations] Translating:", text);

      const targetLanguage = this.language === "es" ? "it" : "es";

      const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
      const url = `${protocol}//${window.location.host}/api/translate`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          from: this.language,
          to: targetLanguage,
          roomId: this.roomId
        })
      });

      if (!response.ok) {
        throw new Error(`Error de traducción: ${response.status}`);
      }

      const data = await response.json();
      console.log("[Translations] Translation response:", data);
    } catch (error) {
      console.error("[Translations] Translation error:", error);
      this.onError?.(error as Error);
    }
  }

  private cleanup() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  stop() {
    console.log("[Translations] Stopping");
    this.cleanup();
  }
}