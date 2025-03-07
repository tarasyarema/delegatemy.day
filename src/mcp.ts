import { Key, screen, FileType, keyboard, mouse, Point, Region, Button, sleep, clipboard } from "@nut-tree-fork/nut-js";
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
import { CONFIG_TMP_PATH, getConfig } from "./config";
import { getDb } from "./storage";
import { desktopCapturer } from "electron";
import { v4 } from "uuid";

const config = getConfig();

const openai = new OpenAI({
  apiKey: config.keys.openai.apiKey,
});

keyboard.config.autoDelayMs = 40;

screen.config.autoHighlight = true;
screen.config.highlightOpacity = 0.2;
screen.config.highlightDurationMs = 2_000;

mouse.config.mouseSpeed = 10;
mouse.config.autoDelayMs = 10;

const PAGE_SCROLL_AMOUNT = 100;


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

  const factor = 1.5;

  const newWidth = Math.round(width / factor);
  const newHeight = Math.round(height / factor);

  const takeScreenshot = async () => {
    let bs: Buffer;

    if (false) {
      console.log(`[debug] Taking screenshot with desktopCapturer`);

      const s = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: width * factor,
          height: height * factor,
        },
      })

      bs = s[0].thumbnail.toPNG();

      // Store the screenshot
      await sharp(bs).png({
        quality: 100,
        compressionLevel: 6,
      }).resize(newWidth, newHeight).toFile(`${CONFIG_TMP_PATH}/out-small.png`);
    } else {
      console.log(`[debug] Taking screenshot with nut-js`);

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

      bs = fs.readFileSync(`${CONFIG_TMP_PATH}/out.png`);

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
  }

  // const { tools } = await client.listTools();
  // const tools: any[] = [];

  console.log(`Using screenshot resolution: ${width}x${height} with scaled resolution: ${newWidth}x${newHeight}`);

  const pointFromCoordinate = (coordinate: number[]) => {
    return new Point(
      Math.round(coordinate[0] * factor),
      Math.round(coordinate[1] * factor),
    );
  }

  const regionFromPoint = (point: Point) => {
    return new Region(
      point.x - 10,
      point.y - 10,
      20,
      20,
    );
  };

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

              const point = pointFromCoordinate(coordinate);
              const region = regionFromPoint(point);

              await mouse.setPosition(point);
              await screen.highlight(region);

              return `Sure, I moved the mouse to (${point.x}, ${point.y})`;
            }
            case "double_click": {
              if (coordinate) {
                const point = pointFromCoordinate(coordinate);
                const region = regionFromPoint(point);

                await mouse.setPosition(point);
                await screen.highlight(region);
              }

              await mouse.leftClick();
              await mouse.leftClick();

              return 'Sure, I double clicked the left mouse button';
            }
            case "left_click": {
              if (coordinate) {
                const point = pointFromCoordinate(coordinate);
                const region = regionFromPoint(point);

                await mouse.setPosition(point);
                await screen.highlight(region);
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
              const to = pointFromCoordinate(coordinate);
              await mouse.drag([curr, to]);

              return `Sure, I dragged the mouse to ({${to.toString()}})`;
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
                console.log(`[debug] Scrolling down ${PAGE_SCROLL_AMOUNT} times`);

                // await mouse.scrollDown(PAGE_SCROLL_AMOUNT);

                // Inverted
                await mouse.scrollUp(PAGE_SCROLL_AMOUNT);

                return 'Sure, I pressed the Page Down key';
              } else if (text === 'Page_Up') {
                console.log(`[debug] Scrolling up ${PAGE_SCROLL_AMOUNT} times`);

                // Inverted
                await mouse.scrollDown(PAGE_SCROLL_AMOUNT);

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
    sleep: tool({
      description: "A tool that sleeps for the specified amount of time, given in milliseconds",
      parameters: z.object({
        ms: z.number().describe("The amount of time to sleep in milliseconds")
      }),
      execute: async ({ ms }) => {
        await sleep(ms);
        return `Sure, I slept for ${ms} milliseconds`;
      }
    }),
    getClipboard: tool({
      description: "A tool that gets the current clipboard content",
      parameters: z.object({}),
      execute: async () => {
        const content = await clipboard.getContent();
        return `The clipboard content is: "${content}"`;
      }
    }),
    setClipboard: tool({
      description: "A tool that sets the clipboard content",
      parameters: z.object({
        content: z.string().describe("The content to set in the clipboard")
      }),
      execute: async ({ content }) => {
        await clipboard.setContent(content);
        return `Sure, I set the clipboard content to: "${content}"`;
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
    fetchContext: tool({
      description: "A tool that fetches context from the database",
      parameters: z.object({
        prompt: z.string().describe("The prompt to fetch context for"),
      }),
      execute: async ({ prompt }) => {
        const resp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: prompt,
          encoding_format: "float",
        });

        const embedding = resp.data?.[0]?.embedding;

        if (!embedding) {
          console.warn(`[mcp] Could not fetch context for prompt: "${prompt}"`);
          return 'Could not fetch context';
        }

        console.log(`[mcp] Fetching context for prompt: "${prompt}"`);

        try {
          const ctx = getDb().prepare(
            `SELECT context, categories FROM context WHERE vector MATCH ? ORDER BY distance LIMIT 1`
          ).get(
            new Float32Array(embedding)
          )

          let text = ''

          if (ctx?.categories) {
            text += `Categories: ${ctx.categories.split('<>').join(', ')}\n`;
          }

          text += `Context: ${ctx?.context ?? 'No context found'}`;

          return text;
        } catch (e) {
          console.error(`[mcp] Could not fetch context for prompt: "${prompt}"`, e);
          return 'Could not fetch context due to an internal error';
        }
      }
    }),
    storeContext: tool({
      description: "A tool that let's you store context for future use",
      parameters: z.object({
        context: z.string().describe("The context to store"),
        categories: z.array(z.string()).describe("The categories for the context")
      }),
      execute: async ({ context, categories }) => {
        const resp = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: `Categories: ${categories.join(' ')}\n${context}`,
          encoding_format: "float",
        });

        const embedding = resp.data?.[0]?.embedding;

        if (!embedding) {
          console.warn(`[mcp] Could not store context for context: "${context}"`);
          return 'Could not store context';
        }

        console.log(`[mcp] Storing context for context: "${context}"`);

        const stmt = getDb().prepare(
          `INSERT INTO context (creation_date, context, categories, vector) VALUES (?, ?, ?, ?)`
        );

        try {
          stmt.run(new Date().toISOString(), context, categories.join('<>'), new Float32Array(embedding));
          console.log(`[mcp] Inserted context with embedding with length: ${embedding.length}`);
        } catch (e) {
          console.error(`[mcp] Could not insert context with embedding`, e);
        }

        return 'Sure, I stored the context';
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

As an AI assistant, your primary role is to help the user manage computer-related tasks efficiently. Use the tools provided to execute commands accurately, always ensuring user instructions are followed closely. 

### Tools and Usage

- **Computer Control**: Directly manipulate system functions like mouse clicks or keyboard input.
- **Speak**: Provide verbal feedback or ask for clarifications.
- **Sleep**: Pause execution for a specified duration, can be used as a polling mechanism. Only use when necessary, or if you want to wait after a specific tool call, use small times like 500ms.
- **See Available Apps**: Review available applications, so you can open them as needed.
- **Open App**: Launch applications as directed.
- **Control Clipboard**: Manage clipboard contents for copy-paste operations.
- **Context Management**: Retrieve or store important user information to maintain continuity across tasks.

### Personal preferences

- My default browser is "Brave Browser".

### Guidelines

- **Date Reference**: Be aware of today's date as ${new Date().toDateString()}.
- **Navigational Commands**: Prefer mouse clicks and direct application access over keyboard shortcuts like Alt+Tab. Always confirm the correct screen position and element focus before action.
- **Sensitive Actions**: Verbally confirm actions that could significantly impact system state or user data.
- **Error Handling**: Stop and seek clarification if instructions are unclear or if an action fails, providing feedback on the issue.

### Pre-defined Workflows

#### Check wheater forecast

If the location is not provided, check in the context for the location. If the location is not found, ask the user for the location.

1. Open to the user default browser application. Make sure it's open before proceeding;
2. Open a new tab at "tiempo.es", and wait for the page to load;
3. Check for the search bar and add the user provided location, but do not click enter;
4. There will be a dropdown with the location, click on it;
5. Scroll down a bit to see the weather forecast for the next days;
6. Speak the weather forecast for today;
7. Ask the user if they want to know the weather for the next days.

#### Draft email reply

The use will have an email open (probably in the browser) and your task is to draft a reply to the email.

1. Check the context for the email recipient, subject, and content. You can see that using a screenshot;
2. Draft a first email with the provided content;
3. Ask the user if they want to add or change anything in the email;

### Operational Tips

- When you want to open an app, make sure to check if the app is available in the system.
- Maintain brevity and precision in communication to streamline interactions.
- For tasks like email or message checking, use the specific apps designated for those functions, ensuring that you do not disrupt ongoing user activities.
- When handling spreadsheets or documents, use appropriate navigation and editing shortcuts.
- Avoid using the top bar in MacOS unless necessary (e.g. if you want to check the open tabs in the browser it makes sense to use it), as it can disrupt the user's workflow.
- Use the sleep tool wisely, generally you would want to check immidiately if you can continue with the next task, but if you are waiting for a specific event, you can use the sleep tool to wait for it.
- If you are unsure about the context of the user or the user prompt is unclear, you can use the fetchContext tool to get the context for the prompt, before asking for clarification.
- When succesfully getting info from the context, make sure to let the user know verbally what you found. Only stop the execution if the context is not found or if it's still unclear.
- In the browser, after opening a new tab, generally you would want to press <kbd>Ctrl</kbd>+<kbd>L</kbd> to focus the address bar, and then type the URL. Make sure to press <kbd>Enter</kbd> after typing the URL.

## Use Past Context

Draw from stored contexts to better understand user preferences and history, applying this knowledge to enhance task execution.

`

export const stream = async (prompt: string, cb: (args: unknown) => void) => {
  const reqId = v4();
  const date = new Date();

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: prompt,
    encoding_format: "float",
  });

  const embedding = response.data?.[0]?.embedding;

  if (embedding) {
    const stmt = getDb().prepare(
      `INSERT INTO prompts (creation_date, prompt, vector) VALUES (?, ?, ?)`
    );

    try {
      stmt.run(new Date().toISOString(), prompt, new Float32Array(embedding));
      console.log(`[mcp] Inserted prompt with embedding with length: ${embedding.length}`);
    } catch (e) {
      console.error(`[mcp] Could not insert prompt with embedding`, e);
    }
  }

  prevText += `--------------\nNew conversation started at ${new Date().toISOString()} with user prompt: "${prompt}"\n***\n`;

  const newSystem = `${system}\n\n${prevText}`;
  console.log(`[mcp] Starting stream with system of length ${newSystem.length} characters...`);

  const res = streamText({
    // model: anthropic("claude-3-7-sonnet-latest"),
    model: anthropic("claude-3-5-sonnet-latest"),
    system: newSystem,
    prompt,
    tools: aiTools,
    maxSteps: 25,
  })

  console.log(`[mcp] Starting stream for prompt: "${prompt}"`);

  for await (const delta of res.fullStream) {
    console.log(`[mcp] Delta: `, delta.type);

    if (delta.type === "text-delta") {
      prevText += delta.textDelta;

      cb({
        id: reqId,
        date,
        role: "system",
        type: "text",
        data: delta.textDelta,
      });
    } else if (delta.type === "tool-call-delta") {
      cb({
        id: reqId,
        date,
        role: "system",
        type: "tool-call",
        data: delta.toolName + " with " + delta.argsTextDelta,
        meta: delta,
      });
    } else if (delta.type as string === "tool-call") {
      const toolName = (delta as any).toolName as string;
      const args = (delta as any).args as Record<string, any>;

      let text = "";

      if (toolName === "computer") {
        text += `Computer action: ${args.action}`;
      } else if (toolName === "fetchContext") {
        text += `Fetching context...`;
      } else if (toolName === "storeContext") {
        text += `Storing context...`;
      } else if (toolName === "speak") {
        text += `Speaking...`;
      } else if (toolName === "sleep") {
        text += `Sleeping for ${args.ms}ms...`;
      }

      if (text.length > 0) {
        text = ` [${text}] `;
      }

      prevText += ` ${text} `;

      cb({
        id: reqId,
        date,
        role: "system",
        type: "tool-call",
        data: text,
        meta: delta,
      });
    }
  }

  prevText += `***\n`;
  console.log(`[mcp] Stream done!`);
}
