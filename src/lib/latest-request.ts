export class LatestRequest {
  private revision = 0;
  private controller?: AbortController;
  next(): { signal: AbortSignal; isCurrent: () => boolean } {
    this.controller?.abort();
    this.controller = new AbortController();
    const current = ++this.revision;
    return { signal: this.controller.signal, isCurrent: () => current === this.revision };
  }
  cancel(): void { this.controller?.abort(); this.revision++; }
}
