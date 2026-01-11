# PPT to Video (LingoDeer 日语 PPT 处理)

这是一个将 PPT/PDF 幻灯片转换为带有语音导读视频的自动化处理系统。特别针对 LingoDeer 日语教学场景进行了优化，支持双语（中文解释日语）生成。

## 主要功能

- **PPTX/PDF 解析**：自动处理上传的演示文档。
- **AI 智能分析**：使用 Gemini API 分析幻灯片内容，生成连贯的讲解词和 TTS 提示词。
- **高音质 TTS**：集成 Gemini TTS API，支持多种语音选择，提供自然的语音导航。
- **视频合成**：将图像与生成的语音拼接，生成完整的教学视频。

## 项目结构

- `/client`: 前端页面，用于文件上传和进度显示。
- `/server`: 后端逻辑，包括 Express 服务和核心处理器 `processor.js`。
- `/uploads`: 临时文件存放目录（已在 `.gitignore` 中忽略）。

## 快速开始

### 预备条件

- Node.js 环境
- Google Gemini API Key

### 安装与运行

1. 克隆项目并安装依赖：
   ```bash
   npm install
   ```

2. 配置环境变量：
   在根目录创建 `.env` 文件并填入：
   ```env
   GEMINI_API_KEY=你的API密钥
   ```

3. 启动服务：
   ```bash
   npm start
   ```

4. 访问 `http://localhost:3000` 开始使用。

## 技术栈

- **前端**: HTML, CSS, JavaScript (Vanilla)
- **后端**: Node.js, Express
- **AI**: Google Gemini Pro (TTS & Content Generation)

## License

MIT
