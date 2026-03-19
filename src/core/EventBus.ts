type Handler = (...args: any[]) => void;

export class EventBus {
  private handlers = new Map<string, Handler[]>();

  on(event: string, handler: Handler): void {
    const list = this.handlers.get(event) ?? [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  off(event: string, handler: Handler): void {
    const list = this.handlers.get(event);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }

  emit(event: string, ...args: any[]): void {
    const list = this.handlers.get(event);
    if (!list) return;
    for (const h of list) h(...args);
  }
}

// Singleton
export const eventBus = new EventBus();
