# User Guide

## Overview

The Stringer Driver App is a tool designed to automate interactions with the MLB Stringer web application. It wraps the web app in a desktop frame and provides sidebar controls for common tasks.

## Getting Started

1.  Launch the application.
2.  **Create New Game**: Use the sidebar button or the tab bar to open a new game session.
3.  Log in to the Stringer web application in the main view. Your session will be persisted (per tab) for future launches.

## Automation Features

The sidebar provides several levels of control:

### Main Automation
-   **Initial Setup**: Runs the pre-game configuration sequence.
    *Note: Ensure you are on the home screen before running this.*
-   **Advance Game**: Opens the sub-menu for game advancement options.

### Advance Game Options
-   **Individual Play**: Open granular controls for specific plays.
-   **Advance Two Full Innings**: Simulates two full innings of play automatically.
-   **ABS Challenge**: Initiates an Automated Ball-Strike system challenge.
-   **Manager Challenge**: Initiates a Manager challenge.

### Individual Play
Trigger specific events directly:
-   **Strikeout** / **Strikeouts to End Inning**
-   **Walk**
-   **Hits**: Single, Double, Triple, Home Run
-   **Outs**: Fly Out, Ground Out

## Troubleshooting

-   **Automation fails**: If an automation script stops working, the web application structure might have changed. Check the logs or contact a developer to update the selectors.
-   **Login issues**: If you are unable to log in, try restarting the application to refresh the session.
-   **"Automation service not ready"**: Ensure the webview is fully loaded and selected before clicking automation buttons.