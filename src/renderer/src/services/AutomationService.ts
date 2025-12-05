export class AutomationService {
  private webview: Electron.WebviewTag;
  private abortSignal: AbortSignal | null = null;
  private pausePromise: Promise<void> | null = null;

  constructor(webview: Electron.WebviewTag) {
    this.webview = webview;
  }

  /**
   * Set the abort signal for cancellation
   */
  setAbortSignal(signal: AbortSignal | null): void {
    console.log('[AutomationService] setAbortSignal called, signal:', signal, 'this:', this);
    this.abortSignal = signal;
  }

  /**
   * Set the pause promise for pausing
   */
  setPausePromise(promise: Promise<void> | null): void {
    console.log('[AutomationService] setPausePromise called, promise:', promise, 'this:', this);
    this.pausePromise = promise;
  }

  /**
   * Check for abort or pause at a control checkpoint
   * Throws AbortError if cancelled, blocks if paused
   */
  async checkpoint(): Promise<void> {
    console.log('[AutomationService] checkpoint called, abortSignal:', this.abortSignal, 'aborted:', this.abortSignal?.aborted, 'pausePromise:', this.pausePromise);
    if (this.abortSignal?.aborted) {
      console.log('[AutomationService] ABORTING - signal is aborted');
      throw new DOMException('Automation cancelled', 'AbortError');
    }
    if (this.pausePromise) {
      console.log('[AutomationService] PAUSING - awaiting pause promise');
      await this.pausePromise;
      console.log('[AutomationService] RESUMED - pause promise resolved');
      // Re-check abort after resuming (in case cancelled while paused)
      if (this.abortSignal?.aborted) {
        console.log('[AutomationService] ABORTING after resume - signal is aborted');
        throw new DOMException('Automation cancelled', 'AbortError');
      }
    }
  }

  /**
   * Interruptible delay - checks abort/pause before and after sleeping
   */
  async delay(ms: number): Promise<void> {
    await this.checkpoint();
    await new Promise(resolve => setTimeout(resolve, ms));
    await this.checkpoint();
  }

  /**
   * Open the DevTools for the webview
   */
  openDevTools(): void {
    if (this.webview.isDevToolsOpened()) {
      this.webview.closeDevTools();
    } else {
      this.webview.openDevTools();
    }
  }

  /**
   * Inject raw JavaScript into the webview
   */
  async execute<T>(code: string): Promise<T> {
    try {
      return await this.webview.executeJavaScript(code);
    } catch (error) {
      console.error('Automation execution failed:', error);
      throw error;
    }
  }

  /**
   * Check if an element exists
   */
  async exists(selector: string): Promise<boolean> {
    return this.execute<boolean>(`
      !!document.querySelector('${selector.replace(/'/g, "\\'")}')
    `);
  }

  /**
   * Click an element by selector using JS click()
   */
  async click(selector: string): Promise<void> {
    await this.execute(`
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (el) {
          el.click();
          return true;
        }
        throw new Error('Element not found: ${selector}');
      })()
    `);
  }

  /**
   * Get element bounding box
   */
  async getBoundingBox(selector: string): Promise<{ x: number, y: number, width: number, height: number } | null> {
    return this.execute(`
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (el) {
          const rect = el.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }
        return null;
      })()
    `);
  }

  /**
   * Click the center of an element using Input Events (simulating real mouse)
   */
  async clickCenter(selector: string): Promise<void> {
    const rect = await this.getBoundingBox(selector);
    if (!rect) {
      throw new Error(`Element not found for clickCenter: ${selector}`);
    }

    const x = Math.floor(rect.x + rect.width / 2);
    const y = Math.floor(rect.y + rect.height / 2);

    await this.webview.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    await this.webview.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  }

  /**
   * Click at a relative position within an element's bounding box
   * xPercent: 0-100 (percentage from left)
   * yPercent: 0-100 (percentage from top)
   */
  async clickRelative(selector: string, xPercent: number, yPercent: number): Promise<void> {
    const rect = await this.getBoundingBox(selector);
    if (!rect) {
      throw new Error(`Element not found for clickRelative: ${selector}`);
    }

    const x = Math.floor(rect.x + (rect.width * xPercent) / 100);
    const y = Math.floor(rect.y + (rect.height * yPercent) / 100);

    await this.webview.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    await this.webview.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  }

  /**
   * Send a key press
   */
  async sendKey(key: string): Promise<void> {
    const lowerKey = key.toLowerCase();
    await this.webview.sendInputEvent({ type: 'keyDown', keyCode: lowerKey });
    await this.webview.sendInputEvent({ type: 'char', keyCode: lowerKey });
    await this.webview.sendInputEvent({ type: 'keyUp', keyCode: lowerKey });
  }

  /**
   * Type text into an input
   */
  async type(selector: string, text: string): Promise<void> {
    await this.execute(`
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        if (el) {
          el.value = '${text.replace(/'/g, "\\'")}';
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        throw new Error('Element not found: ${selector}');
      })()
    `);
  }

  /**
   * Wait for an element to appear (supports interruption via checkpoint)
   */
  async waitFor(selector: string, timeoutMs = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        await this.checkpoint(); // Check abort/pause each iteration
        if (await this.exists(selector)) return true;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return false;
  }

  /**
   * Get text content of an element
   */
  async getText(selector: string): Promise<string> {
    return this.execute<string>(`
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}');
        return el ? el.innerText : '';
      })()
    `);
  }
}
