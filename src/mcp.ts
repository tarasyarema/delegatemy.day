import { Key, screen, FileType, keyboard, mouse, Point, Region, Button } from "@nut-tree/nut-js";
import { createAnthropic } from "@ai-sdk/anthropic"
import fs from "fs";
import { z } from 'zod';
import { streamText, tool } from "ai";
import sharp from "sharp";
import OpenAI from "openai";
import Speaker from 'speaker';
import { getInstalledApps } from 'get-installed-apps'
import { exec } from 'child_process';
import say from 'say';
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { CONFIG_TMP_PATH, CONFIG_DB_PATH, getConfig } from "./config";

const config = getConfig();

const db = new Database(CONFIG_DB_PATH);
sqliteVec.load(db);

const { sqlite_version, vec_version } = db
  .prepare(
    "select sqlite_version() as sqlite_version, vec_version() as vec_version;",
  )
  .get();

console.log(`[mcp] SQLite version: ${sqlite_version}, SQLite-vec version: ${vec_version}`);

keyboard.config.autoDelayMs = 40;

screen.config.autoHighlight = true;
screen.config.highlightOpacity = 0.2;
screen.config.highlightDurationMs = 2_000;

mouse.config.mouseSpeed = 10;
mouse.config.autoDelayMs = 10;

const openai = new OpenAI({
  apiKey: config.keys.openai.apiKey,
});

function capitalizeFirstLetter(val: string) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

const stringToKeys = (text: string) => {
  return text.split('+').map((c) => {
    const raw = c;
    const t = capitalizeFirstLetter(raw.trim());

    if (t === "Alt") {
      return Key.LeftAlt;
    }

    if (t === "Ctrl") {
      if (process.platform === 'darwin') {
        return Key.LeftCmd;
      }

      return Key.LeftControl;
    }

    try {
      const n = parseInt(t);

      if (!Number.isNaN(n)) {
        return Key[`Num${n}` as any];
      }
    } catch (e) {
      // pass
    }

    const maybeKey = Key[t as any];

    if (!maybeKey) {
      return raw;
    }

    return maybeKey;
  });
}

const anthropic = createAnthropic({
  apiKey: config.keys.anthropic.apiKey,
});

export const speak = async (text: string) => {
  const now = new Date();

  const audio = await openai.audio.speech.create({
    input: text,
    model: "tts-1",
    voice: "echo",
    response_format: "wav",
    speed: 1.2,
  });

  const resp = await audio.arrayBuffer();

  console.log(`[mcp] Speaking ${resp.byteLength} bytes after ${new Date() - now}ms`);

  const speaker = new Speaker({
    channels: 1,
    bitDepth: 16,
    sampleRate: 22050,
  });

  const buffer = Buffer.from(resp);

  speaker.write(buffer, (e) => {
    console.log(`[mcp] Error on write cb: ${e}`);
  });

  await new Promise(resolve => speaker.on('drain', resolve));

  console.log(`[mcp] Spoken text: "${text}" in ${new Date() - now}ms`);

  speaker.end();

  console.log(`[mcp] Speaker closed and destroyed`);
}

export const speakNative = async (text: string, voice?: string, speed?: number) => {
  return new Promise((resolve, reject) => {
    say.speak(text, voice ?? "Alex", speed ?? 1, (err) => {
      if (err) {
        reject(err);
      }

      resolve(null);
    });
  });
}

const openApp = async (appName: string) => {
  const apps = [
    ...((await getInstalledApps()) as { appName: string }[]).map(a => a.appName),
    "notes"
  ]

  const app = apps.find(a => a.toLowerCase() === appName.toLowerCase());

  console.log(`[mcp] Opening app "${app}", found = ${!!app}`);

  if (!app) {
    return `App "${appName}" not found`;
  }

  // Execute `open -a "name"` on macOS

  if (process.platform === 'darwin') {
    exec(`open -a "${app}"`, (error) => {
      if (error) {
        console.error(`Could not open app "${app}"`, error);
        return `Could not open app "${app}"`;
      }
    });
  }

  return `Sure, I opened the app "${app}"`;
}

let aiTools = {};

export const run = async () => {
  // await client.connect(transport);

  const width = await screen.width();
  const height = await screen.height();

  const factor = 2;

  const newWidth = width / factor;
  const newHeight = height / factor;

  const takeScreenshot = async () => {
    try {
      const resp = await screen.capture(
        "out.png",
        FileType.PNG,
        CONFIG_TMP_PATH,
      );

      console.log(`[debug] Took screenshot: ${resp}`);
    } catch (e) {
      console.error(`[debug] Could not take screenshot`, e);
      return;
    }

    const bs = fs.readFileSync(`${CONFIG_TMP_PATH}/out.png`);

    try {
      await (
        sharp(bs).png({
          quality: 100,
          compressionLevel: 6,
        }).resize(newWidth, newHeight)
      ).toFile(`${CONFIG_TMP_PATH}/out-small.png`);
    } catch (e) {
      console.error(`Could not resize image`, e);
    }
  }

  // const { tools } = await client.listTools();
  const tools: any[] = [];

  console.log(`Using screenshot resolution: ${width}x${height}`);

  const defaultTools = {
    computer: anthropic.tools.computer_20241022({
      // computer: anthropic.tools.computer_20250124({
      displayWidthPx: newWidth,
      displayHeightPx: newHeight,
      // displayNumber: 0, // Optional, for X11 environments

      execute: async (args) => {
        try {
          const { action, coordinate, text } = args;
          //
          // Implement your computer control logic here
          // Return the result of the action

          console.log('\n[mcp] Computer action: ', { args });

          // Example code:
          switch (action) {
            case 'screenshot': {
              await takeScreenshot();

              return {
                type: 'image',
                data: fs.readFileSync(`${CONFIG_TMP_PATH}/out-small.png`).toString('base64'),
              };
            }
            case "mouse_move": {
              if (!coordinate) {
                return 'No coordinate provided for a mouse move action';
              }

              const x = coordinate[0] * factor;
              const y = coordinate[1] * factor;

              await mouse.setPosition(new Point(x, y));

              await screen.highlight(
                new Region(x - 10, y - 10, 20, 20),
              )

              return `Sure, I moved the mouse to (${x}, ${y})`;
            }
            case "double_click": {
              if (coordinate) {
                const x = coordinate[0] * factor;
                const y = coordinate[1] * factor;

                await mouse.setPosition(new Point(x, y));

                await screen.highlight(
                  new Region(x - 10, y - 10, 20, 20),
                )
              }

              await mouse.leftClick();
              await mouse.leftClick();

              return 'Sure, I double clicked the left mouse button';
            }
            case "left_click": {
              if (coordinate) {
                const x = coordinate[0] * factor;
                const y = coordinate[1] * factor;

                await mouse.setPosition(new Point(x, y));

                await screen.highlight(
                  new Region(x - 10, y - 10, 20, 20),
                )
              }

              await mouse.leftClick();
              return 'Sure, I clicked the left mouse button';
            }
            case "right_click": {
              await mouse.rightClick();
              return 'Sure, I clicked the right mouse button';
            }
            case "middle_click": {
              await mouse.click(Button.MIDDLE);
              return 'Sure, I clicked the middle mouse button';
            }
            case "cursor_position": {
              const position = await mouse.getPosition();
              return `The cursor is at (${position.x}, ${position.y})`;
            }
            case "left_click_drag": {
              if (!coordinate) {
                return 'No coordinate provided for a left click drag action';
              }

              const curr = await mouse.getPosition();
              const to = new Point(coordinate[0], coordinate[1]);
              await mouse.drag([curr, to]);

              return `Sure, I dragged the mouse to (${coordinate[0]}, ${coordinate[1]})`;
            }
            case 'type': {
              if (!text) {
                return 'No text provided for a type action';
              }

              const byNewLine = text.split('\n');

              for (const line of byNewLine) {
                await keyboard.type(line);
                await keyboard.pressKey(Key.Enter);
              }

              console.log(`Typed ${byNewLine.length} lines of a total of ${text.length} characters`);

              return `Sure, I typed the text: "${text}"`;
            }
            case 'key': {
              if (!text) {
                return 'No text provided for a key action';
              }

              // Special case
              if (text === 'Page_Down') {
                await mouse.scrollDown(10);
                return 'Sure, I pressed the Page Down key';
              } else if (text === 'Page_Up') {
                await mouse.scrollUp(10);
                return 'Sure, I pressed the Page Up key';
              }

              const keys = stringToKeys(text);
              console.log(`[debug] Pressing keys: ${keys} from text: "${text}"`);

              try {
                await keyboard.type(...(keys as any));
              } catch (e) {
                console.error('Could not press key/s ${keys}', e);
                return 'Could not press key/s';
              }

              return `Sure, I pressed the key/s "${keys}"`;
            }
            default: {
              return 'Action not supported';
            }
          }
        } catch (e) {
          console.error('Error in computer tool:', e);
          return 'Error in computer tool';
        }
      },

      // map to tool result content for LLM consumption:
      experimental_toToolResultContent(result: any) {
        return typeof result === 'string'
          ? [{ type: 'text', text: result }]
          : [{ type: 'image', data: result.data, mimeType: 'image/png' }];
      },
    }),
    speak: tool({
      description: "A tool that speaks the provided text",
      parameters: z.object({
        text: z.string().describe("The text to speak")
      }),
      execute: async ({ text }) => {
        // await speak(text);
        await speakNative(text);
        return `Sure, I spoke the text: "${text}"`;
      }
    }),
    apps: tool({
      description: "A tool that lists the installed apps",
      parameters: z.object({}),
      execute: async () => {
        const apps = [
          ...((await getInstalledApps()) as { appName: string }[]).map(a => a.appName),
          "notes"
        ];

        return `Installed apps\n${apps.map(name => `- ${name}`).join('\n')}`;
      }
    }),
    openApp: tool({
      description: "A tool that opens the specified application",
      parameters: z.object({
        appName: z.string().describe("The name of the app to open")
      }),
      execute: async ({ appName }) => {
        try {
          await openApp(appName);
        } catch (e) {
          console.error(`Could not open app "${appName}"`, e);
          return `Could not open app "${appName}"`;
        }

        return `Sure, I opened the app: "${appName}"`;
      }
    }),
  }

  // aiTools = tools.reduce((acc, t) => ({
  //   [t.name]: tool({
  //     description: t.description,
  //     parameters: z.object(
  //       Object.entries(t.inputSchema.properties).reduce((acc, [name, schema]) => {
  //         return {
  //           [name]: z.string().describe(schema.description),
  //           ...acc
  //         }
  //       }, {})
  //     ),
  //     execute: async (args) => {
  //       const result = await client.callTool({
  //         name: t.name,
  //         arguments: args
  //       });
  //
  //       return result.content?.[0]?.text ?? "No result";
  //     }
  //   }),
  //   ...acc
  // }), defaultTools);

  aiTools = defaultTools;
}

let prevText = "";

const system = `
## Context

Your goal is to help the user with their computer tasks. Make sure to follow their instructions and provide helpful responses. 

Also, you need to make sure that any additional information is passed to the tools to make the life easier, e.g. passing the 
coordinates of the mouse click to the computer tool.

Use the previous conversations to provide context and help the user with their tasks, so for example if the user asks for a follow-up
check if the previous conversations contain any relevant information that can be used to help the user.

## Remarks

- Today is ${new Date().toDateString()}.
- If you see the "Delegate My Day" app open, make sure to minimize it before doing any other action, as it might interfere with the user's tasks.
- The default browser used is "Brave Browser" (you will be able to see it in the available apps), and before opening a new one check if there's a browser already open.
- Make sure to open a new tab in the browser if you are asked to search for something, so that the user can continue using the current tab.
- Generally, when the user asks to check something / send message / etc. you might want to check if there's a specific app for that action, if not use the default browser and check if there's a tab that can be used. Examples of this could be "Send a Whatsapp" or "Check my email".
- The user might ask for transcribing / dictating text, use the appropriate tool for that.
- Avoid using Alt+Tab to switch between windows, as it might not work as expected. Instead use either clicks or the installed apps tool to switch between apps.
- When you are gonna do a "sensitive" action, make sure to speak it before, to make the user aware of what you are going to do.
- When you move the mouse, make sure to move it to the CORRECT POSITION, specially in the MIDDLE OF THE ELEMENT that you are looking at. Always take into account the resolution of the screen.
- Before clicking or typing, make sure to move the mouse to the correct position, and the element is in focus!
- When asked for scrolling, make sure to use the scroll tool with the correct amount and direction.
- Avoid using "Page Up" or "Page Down" keys, as they might not work as expected. Instead use the scroll tool with the correct amount and direction.
- If clicking do not work, make sure to get a screenshot and use the cursor position tool to re-localize the mouse.
- If you are unsure about the action that the user is asking, stop immediately and ask for clarification before proceeding. So that the user can provide timely feedback.
- Sometimes the tabs in the browser might not be visible, make sure to check if there's a tab that can be used before opening a new one. You can use the top bar to switch between tabs.
- In the end of each conversation, make sure to speak any follow-up questions or actions that the user might need to know.
- When working with sheets, sometimes you might need to use the keyboard to navigate between cells, make sure to use the correct keys for that. In those cases generally you need to double click on the cell to edit it. And then to move to the next cell you can use the "Tab" key. Also, to go out of the cell you can use the "Enter" key.
- Be brief and concise in your intermediate responses, and make sure to provide the user with the necessary information to proceed. This will help make the whole process more efficient and faster.
- If you need some additional information to perform the requested action, make sure to ask the user for it. For example, if you need the name of the app to open, ask the user for it. Once you have all the necessary information, proceed with the action, and do as much as you can to help the user without asking for more information again.

## Shortcuts / workflows

Here's a list of pre-defined shortcuts and workflows that you can use to help the user with their tasks:

### Use WhatsApp

1. Open the browser
2. Check for an existing WhatsApp tab, if not open it at https://web.whatsapp.com/
3. Do the user requested action or ask the user for more information

### Slack unreads

1. Open the Slack app
2. Check for the "Unreads" text in bold in the top left corner
3. Click in the middle of the screen
4. Scroll down using the "scroll" tool until you see all the unread messages

## Previous Conversations

Use the context below coming from past conversations to help the user with their tasks.

`

export const stream = async (prompt: string, cb: (text: string) => void) => {
  prevText += `--------------\nNew conversation started with prompt at ${new Date().toISOString()} with prompt: "${prompt}"\n***\n`;

  const newSystem = `${system}\n\n${prevText}`;
  console.log(`[mcp] Starting stream with system\n\n${newSystem}\n\n`);

  const res = streamText({
    // model: anthropic("claude-3-7-sonnet-latest"),
    model: anthropic("claude-3-5-sonnet-latest"),
    system: newSystem,
    prompt,
    tools: aiTools,
    maxSteps: 25,
  })

  console.log(`[mcp] Starting stream for prompt: "${prompt}"`);

  for await (const text of res.textStream) {
    prevText += text;

    cb(text);
  }

  prevText += `***\n`;
  console.log(`[mcp] Stream done!`);
}
