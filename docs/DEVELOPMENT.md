# Development Guide

## Setup

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

## Running in Development Mode

Start the Electron application with hot reload:

```bash
npm run dev
```

## Project Structure

- **src/main**: Main process code (Electron window management).
- **src/preload**: Preload scripts (IPC bridge).
- **src/renderer**: React application (UI).
  - **components**: UI components.
  - **services**: Logic for communicating with the webview.
  - **automations**: Scripts for driving the Stringer app.

## Adding New Automations

1. Create a new script in `src/renderer/src/automations/`.
2. Use the `AutomationService` to interact with the webview.
   ```typescript
   export const myScript = async (service: AutomationService) => {
     await service.click('#my-button');
   };
   ```
3. Import the script in `Sidebar.tsx` and add a button to trigger it.

## Building for Production

```bash
npm run build
```

