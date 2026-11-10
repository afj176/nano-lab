# Nano Lab

**[nanolab.fyi](https://nanolab.fyi)**

![Nano Lab generating speech in the browser](docs/screenshot.png)

Nano Lab is a small learning project: a web page that runs tiny AI models entirely in your browser. You can generate text, speech, images and short videos, and transcribe audio, then compare how fast each model runs and rate the results. Nothing is sent to a server and there is no API key.

## Run it locally

You need Node.js 24 or newer and a current Chrome or Edge with hardware acceleration turned on.

```bash
npm install
```

```bash
npm run dev
```

Open the address it prints. Models download the first time you use them, from about 30 MB to 665 MB each.

## What's included

| Tab | Models |
|---|---|
| Text | SmolLM2 135M and 360M |
| Speech | Supertonic TTS, MMS TTS |
| Transcribe | Moonshine Tiny, Whisper Base |
| Image | NanoDiffuser |
| Video | Drishya Tiny |

It also keeps a history of your runs with timings and star ratings, and has light and dark themes.

The code is plain JavaScript and CSS built with Vite, and is MIT licensed. Each model has its own license, listed in the app's About panel; MMS TTS and Drishya Tiny are for noncommercial use only.
