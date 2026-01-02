<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1gFZpawivVq3aTNym53sKbMxQD1SF4PM3

## Run Locally

**Prerequisites:**  Node.js

** hướng dẫn cài đặt
1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key(có càng tốt)
3. Run the app:
   `npm run dev`

 **công nghệ đc sử dụng**
**Ngôn ngữ & build**
TypeScript (tsconfig.json) — dự án viết bằng TS.
Node.js + NPM (chạy lệnh trong README.md).
Vite — dev server & bundler (vite, vite.config.ts).
⚛️ Frontend / UI
React 19 (react, react-dom — App.tsx, index.tsx).
Tailwind CSS (CDN) (index.html).
lucide-react (icons) — import trong GeminiSlingshot.tsx.
Canvas / <video> — render game trong GeminiSlingshot.tsx.
🤖 AI / ML & tracking
@google/genai (Gemini client) — logic trong geminiService.ts (model: gemini-3-flash-preview).
MediaPipe Hands (hand tracking) — CDN scripts in index.html, dùng trong GeminiSlingshot.tsx.
🌐 Browser / runtime
Import maps (module CDN mapping) — index.html.
Camera / getUserMedia (quyền camera) — metadata.json & code khởi tạo camera.
🧰 Dev tooling & config
@vitejs/plugin-react, typescript, @types/node (devDeps).
Env var GEMINI_API_KEY (được đọc trong vite.config.ts & geminiService.ts).
