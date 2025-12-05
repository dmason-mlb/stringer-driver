# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start Electron app with hot reload
npm run build        # Build for production
npm run lint         # Run ESLint
```

## Architecture

Electron desktop app wrapping the MLB Stringer web application with automation capabilities.

**Process Structure:**
- `src/main/` - Electron main process (window management, IPC handlers)
- `src/preload/` - IPC bridge between main and renderer
- `src/renderer/src/` - React UI

**Renderer Structure:**
- `components/` - UI components (Sidebar, TabList, StringerView)
- `services/AutomationService.ts` - API for webview interaction
- `automations/` - Scripts that drive the Stringer app
- `context/AutomationContext.tsx` - Provides AutomationService to components

## Key Patterns

**Webview Automation:**
All automation uses `webview.executeJavaScript()` via AutomationService. Key methods:
- `click(selector)` / `clickCenter(selector)` - Click elements
- `type(selector, text)` - Input text
- `waitFor(selector, timeout)` - Wait for elements
- `execute<T>(code)` - Run arbitrary JS in webview context

**Adding New Automations:**
1. Create script in `src/renderer/src/automations/`
2. Import AutomationService and use its methods
3. Add trigger button in `Sidebar.tsx`

**Session Isolation:**
Each tab uses a separate Electron session partition (`persist:stringer-{id}`) for independent login sessions and cookies.

**Loading States:**
Tabs track loading state independently via `tabLoadingStates` in App.tsx. Set loading before automation, clear after completion.

## Important Notes

- DOM selectors are tightly coupled to Stringer's HTML structure - will break if Stringer updates its UI
- Target URL: `https://stringer-qa.bdatasf.mlbinfra.com/client/index.html`
- Automations inject JavaScript that dispatches synthetic click/input events
