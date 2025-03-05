import { PvRecorder } from "@picovoice/pvrecorder-node";
import { WaveFile } from "wavefile";
import fs from "fs";
import OpenAI from "openai";
import { speakNative, stream } from './mcp';
import { CONFIG_TMP_PATH, getConfig } from "./config";

const config = getConfig();

const openai = new OpenAI({
  apiKey: config.keys.openai.apiKey,
});

const outputWavPath = `${CONFIG_TMP_PATH}/output.wav`;

let firstTime = true;
let recording = false;

export const setRecording = (value: boolean) => {
  recording = value;
}

export const recordAudio = async (limit?: number, cb?: any) => {
  cb('recording', null);

  // Clean the file
  fs.rm(outputWavPath, { force: true }, () => { console.log(`[worker] Cleaned up ${outputWavPath}`) });

  const wav = new WaveFile();
  let frames: any = [];

  const frameLength = 1024;
  const recorder = new PvRecorder(frameLength);

  console.log(`[worker] Using PvRecorder version: ${recorder.version} with device: ${recorder.getSelectedDevice()}`);

  recorder.start();

  let i = 0;

  // ~10 seconds
  while (limit ? i < limit : true) {
    const frame = await recorder.read();
    frames.push(frame);

    i++;

    if (!limit && !recording) {
      console.log(`[worker] Stopping toggle...`);
      break;
    }
  }

  const audioData = new Int16Array(recorder.frameLength * frames.length);

  for (let i = 0; i < frames.length; i++) {
    audioData.set(frames[i], i * recorder.frameLength);
  }

  wav.fromScratch(1, recorder.sampleRate, '16', audioData);
  fs.writeFileSync(outputWavPath, wav.toBuffer());

  recorder.release();

  console.log(`[worker] Recorded ${frames.length} frames: ${frames.length * frameLength / recorder.sampleRate} seconds`);
  cb('recording-done', null);
}

export const capture = async (shouldRecord: boolean, cb?: any) => {
  if (recording) {
    console.log("[worker] Already recording, skipping...");
    return;
  }

  if (shouldRecord) {
    await recordAudio(156, cb);
  } else {
    console.log("[worker] Using existing audio file...");
  }


  if (firstTime) {
    await speakNative("Ok, let me process that");
  } else {
    await speakNative("Ok");
  }

  firstTime = false;
  // Sleep for a bit
  await new Promise(resolve => setTimeout(resolve, 500));

  console.log("[worker] Recording done after waiting 1s, waiting for transcriptions...");

  const res = await openai.audio.transcriptions.create({
    file: fs.createReadStream(outputWavPath),
    response_format: "text",
    language: "en",
    model: "whisper-1",
  })

  console.log(`[worker] Transcription`, { res });

  await stream(
    res,
    (data) => {
      cb('transcription', data);
    }
  );

  console.log("[worker] Stopping...");
}

