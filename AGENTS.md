<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# AnimeMaker specific rules

- **外部 API キー (OPENAI_API_KEY, GEMINI_API_KEY 等) は絶対に使わない。** `.env` も作らない。
- 画像生成は Codex 自身の画像生成ツールで行う。HTTP / curl で画像生成 API を叩かない。
- 参照画像は cwd の `reference.png` として保存済み。これを参照してキャラクター一貫性を厳密に維持する。
- 出力は cwd 直下のフラットなファイル構成 (`pose.png` または `frame_*.png` + `manifest.json`)。
