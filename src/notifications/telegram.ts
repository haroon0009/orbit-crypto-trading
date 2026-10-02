export interface CriticalNotifier {
  send(message: string): Promise<void>;
}

export const noNotifications: CriticalNotifier = {
  async send() {},
};

export class TelegramNotifier implements CriticalNotifier {
  constructor(
    private readonly token: string,
    private readonly chatId: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!token || !chatId) throw new Error("Telegram credentials are required");
  }

  async send(message: string): Promise<void> {
    const response = await this.fetcher(
      `https://api.telegram.org/bot${this.token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: this.chatId, text: message }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
    const body = (await response.json()) as { ok?: boolean };
    if (body.ok !== true) throw new Error("Telegram rejected the alert");
  }
}
