require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { extractImagesFromPPTX, convertPDFToImages, analyzeAllSlides, textToSpeech, createClip, mergeClips } = require('./processor');

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const upload = multer({ dest: 'uploads/' });

app.post('/api/convert', upload.single('pptx'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        const projectDir = path.join(__dirname, '../uploads', req.file.filename + '_processed');
        const imagesDir = path.join(projectDir, 'images');
        const audioDir = path.join(projectDir, 'audio');
        const clipsDir = path.join(projectDir, 'clips');

        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
        if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
        if (!fs.existsSync(clipsDir)) fs.mkdirSync(clipsDir, { recursive: true });

        // 1. 根据格式提取图片
        let images = [];
        const ext = path.extname(req.file.originalname).toLowerCase();

        if (ext === '.pptx') {
            images = await extractImagesFromPPTX(req.file.path, imagesDir);
        } else if (ext === '.pdf') {
            images = await convertPDFToImages(req.file.path, imagesDir);
        } else {
            return res.status(400).send('Unsupported file format. Please upload .pptx or .pdf');
        }

        // 2. AI 一次性整体分析 (全场景感知，保证连贯性)
        const allAiInfo = await analyzeAllSlides(images);

        const clipPaths = [];
        const results = [];

        for (let i = 0; i < images.length; i++) {
            const imgPath = images[i];
            const baseName = `page_${i}`;
            const aiInfo = allAiInfo[i] || { content: "继续学习...", tts_prompt: "平稳" };

            // 3. TTS 生成
            const audioPath = path.join(audioDir, `${baseName}.mp3`);
            const selectedVoice = req.body.voice || 'Aoede';
            await textToSpeech(aiInfo.content, aiInfo.tts_prompt, audioPath, selectedVoice);

            // 4. 生成短视频片段
            const clipPath = path.join(clipsDir, `${baseName}.mp4`);
            await createClip(imgPath, audioPath, clipPath);

            clipPaths.push(clipPath);
            results.push({
                image: path.basename(imgPath),
                ...aiInfo,
                clip: clipPath
            });
        }

        // 5. 合并最终视频
        const finalVideoPath = path.join(projectDir, 'final_video.mp4');
        await mergeClips(clipPaths, finalVideoPath);

        res.json({
            message: 'Processing completed',
            videoUrl: `/uploads/${req.file.filename}_processed/final_video.mp4`,
            details: results
        });

    } catch (error) {
        console.error('SERVER ERROR:', error);
        res.status(500).json({
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
