export class AutomationService {
  private webview: Electron.WebviewTag;

  constructor(webview: Electron.WebviewTag) {
    this.webview = webview;
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
   * Click an element by selector
   */
  async click(selector: string): Promise<void> {
    await this.execute(`
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}'');
        if (el) {
          el.click();
          return true;
        }
        throw new Error('Element not found: ${selector}');
      })()
    `);
  }

  /**
   * Type text into an input
   */
  async type(selector: string, text: string): Promise<void> {
    await this.execute(`
      (function() {
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}'');
        if (el) {
          el.value = '${text.replace(/'/g, "\\'")}'';
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
        const el = document.querySelector('${selector.replace(/'/g, "\\'")}'');
        return el ? el.innerText : '';
      })()
    `);
  }
}

