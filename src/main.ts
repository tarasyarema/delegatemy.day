import { app, BrowserWindow, globalShortcut, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { setupConfig } from './config';
import { run } from './mcp';
import { capture, recordAudio, setRecording } from './worker';

let mainWindow: BrowserWindow | null = null;
let toggle = false;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

type Payload = {
  source: string;
  event: string;
  data: any;
}

const createWindow = async () => {
  setupConfig();

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
        await capture(true, (action: string, data: any) => {
          console.log('[main] capture cb with', { action, data });

          mainWindow?.webContents.send(
            'test',
            { source: 'main', action, data }
          )
        });
        break;
    }
  });

  globalShortcut.register('Command+Shift+L', async () => {
    console.log('[main] Command+Shift+L pressed');

    await capture(
      true,
      (action: string, data: any) => {
        console.log('[main] capture cb with', { action, data });

        mainWindow?.webContents.send(
          'test',
          { source: 'main', action, data }
        )
      },
    )
  });

  globalShortcut.register('Command+Shift+T', async () => {
    if (toggle) {
      console.log('[main] Command+Shift+T pressed, stopping');
      toggle = false;

      setRecording(toggle);

      // Wait for a second
      await new Promise((resolve) => {
        setTimeout(() => {
          resolve(null);
        }, 1000);
      });

      await capture(false, (action: string, data: any) => {
        console.log('[main] capture from toggle cb with', { action, data });

        mainWindow?.webContents.send(
          'test',
          { source: 'main', action, data }
        )
      });
    } else {
      console.log('[main] Command+Shift+T pressed, starting');
      toggle = true;

      setRecording(toggle);

      // Start recording
      await recordAudio(
        undefined,
        (action: string, data: any) => {
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
    width: 800,
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

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// app.on('activate', () => {
//   // On OS X it's common to re-create a window in the app when the
//   // dock icon is clicked and there are no other windows open.
//   if (BrowserWindow.getAllWindows().length === 0) {
//     createWindow();
//   }
// });

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
