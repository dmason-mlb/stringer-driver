export class AutomationService {
  private webview: Electron.WebviewTag;

  constructor(webview: Electron.WebviewTag) {
    this.webview = webview;
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
   * Wait for an element to appear
   */
  async waitFor(selector: string, timeoutMs = 5000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
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
