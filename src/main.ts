import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { setupConfig } from './config';
import { run } from './mcp';
import { capture, handleTask, recordAudio, setRecording } from './worker';
import { setupDb } from "./storage";
import { v4 } from 'uuid';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null

let toggle = false;

if (started) {
  app.quit();
}

type Payload = {
  source: string;
  event: string;
  data: unknown;
}

const createWindow = async () => {
  setupConfig();
  setupDb();

  console.log('[main] MCP starting...');
  await run();

  console.log('[main] All done, starting main window...');

  ipcMain.handle('test', async (_, payload: Payload) => {
    console.log('[main] Received test event:', { payload });

    if (payload.source !== "renderer") {
      return;
    }

    switch (payload.event) {
      case 'start':
        console.log('[main] Starting recording...');

        mainWindow?.minimize();

        tray?.setImage('assets/rec-16.png');

        await capture(true, (action: string, data: unknown) => {
          console.log('[main] capture cb with', { action, data });

          mainWindow?.webContents.send(
            'test',
            { source: 'main', action, data }
          )
        });

        tray?.setImage('assets/icon-no-bg-16.png');

        if (mainWindow?.isMinimized()) {
          mainWindow?.restore();
        }

        break;

      case 'start-text':
        console.log('[main] Starting task from text...');

        mainWindow?.webContents.send(
          'test',
          {
            source: 'main',
            action: 'transcription',
            data: {
              id: v4(),
              date: new Date(),
              type: 'text',
              role: 'user',
              data: payload.data,
            }
          }
        )

        mainWindow?.minimize();

        await handleTask(payload.data as string, (action: string, data: unknown) => {
          console.log('[main] handleTask cb with', { action, data });

          mainWindow?.webContents.send(
            'test',
            { source: 'main', action, data }
          )
        });

        if (mainWindow?.isMinimized()) {
          mainWindow?.restore();
        }

        break;
    }
  });

  globalShortcut.register('Command+Shift+L', async () => {
    console.log('[main] Command+Shift+L pressed');

    tray?.setImage('assets/rec-16.png');

    mainWindow?.minimize();

    await capture(
      true,
      (action: string, data: unknown) => {
        console.log('[main] capture cb with', { action, data });

        mainWindow?.webContents.send(
          'test',
          { source: 'main', action, data }
        )
      },
    )

    if (mainWindow?.isMinimized()) {
      mainWindow?.restore();
    }

    tray?.setImage('assets/icon-no-bg-16.png');
  });

  globalShortcut.register('Command+Shift+T', async () => {
    if (toggle) {
      console.log('[main] Command+Shift+T pressed, stopping');
      toggle = false;

      setRecording(toggle);

      mainWindow?.minimize();

      // Wait for a second
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(null);
        }, 1000);
      });

      await capture(false, (action: string, data: unknown) => {
        console.log('[main] capture from toggle cb with', { action, data });

        mainWindow?.webContents.send(
          'test',
          { source: 'main', action, data }
        )
      });

      if (mainWindow?.isMinimized()) {
        mainWindow?.restore();
      }

      tray?.setImage('assets/icon-no-bg-16.png');
    } else {
      console.log('[main] Command+Shift+T pressed, starting');
      toggle = true;

      tray?.setImage('assets/rec-16.png');

      setRecording(toggle);

      // Start recording
      await recordAudio(
        undefined,
        (action: string, data: unknown) => {
          console.log('[main] recordAudio from toggle cb with', { action, data });

          mainWindow?.webContents.send(
            'test',
            { source: 'main', action, data }
          )
        }
      );
    }
  });

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 600,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  mainWindow.show();
};

const createTray = () => {
  tray = new Tray('assets/icon-no-bg-16.png');

  const contextMenu = Menu.buildFromTemplate([]);

  tray.setToolTip('Delegate My Day');
  tray.setContextMenu(contextMenu)
}

const onReady = async () => {
  try {
    createTray();
    await createWindow();
  } catch (e) {
    console.error(`[main] Error in onReady: ${e.message}`);
  }
}

app.on('ready', onReady);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
