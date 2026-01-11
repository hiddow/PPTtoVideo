const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const util = require('util');
const { PDFDocument } = require('pdf-lib');
const { exec } = require('child_process');
const execPromise = util.promisify(exec);
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');

// 初始化 Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// 这里的 ttsClient 不再需要，我们将使用 REST API

/**
 * 解析 PPTX 并提取图片
 * @param {string} filePath PPTX 文件路径
 * @param {string} outputDir 输出目录
 */
async function extractImagesFromPPTX(filePath, outputDir) {
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const imageMap = [];

    // 简单逻辑：提取 ppt/media 下的图片
    // 进阶逻辑：需要解析 ppt/slides/slideN.xml 关联到 media
    // 这里先实现基础版：按照文件名排序作为页面顺序
    zipEntries.forEach((entry) => {
        if (entry.entryName.startsWith('ppt/media/')) {
            const ext = path.extname(entry.entryName).toLowerCase();
            if (['.png', '.jpg', '.jpeg'].includes(ext)) {
                const targetPath = path.join(outputDir, path.basename(entry.entryName));
                fs.writeFileSync(targetPath, entry.getData());
                imageMap.push(targetPath);
            }
        }
    });

    // 排序确保顺序 (假设 media1 是第一页，这只是初步方案)
    return imageMap.sort((a, b) => {
        const numA = parseInt(a.match(/\d+/) || 0);
        const numB = parseInt(b.match(/\d+/) || 0);
        return numA - numB;
    });
}

/**
 * 使用 Gemini 一次性分析所有图片，保证文案连贯性
 * @param {Array} imagePaths 图片路径数组
 */
async function analyzeAllSlides(imagePaths) {
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const parts = [
        {
            text: `
            你是一个专业的语言学习频道播主（例如：LingoDeer 的金牌讲师）。
            你的母语是**地道、无口音的标准普通话**。
            请按顺序分析这组 PPT 幻灯片，并为每一页生成生动、自然的讲解词。
            
            ### 关键要求：
            1. **地道普通话**：解说词必须使用最自然、地道的现代标准汉语。避免翻译腔。
            2. **连贯性**：文案必须有上下文关联，使用自然的过渡语（如“承接上文”、“接下来”）。
            3. **精准发音标注**：
               - 当文稿中出现日语发音（如 Romaji: wa, ha, wo）或其他外语注音时，不要仅写英语字母，**必须确保 TTS 能正确读出目标音**。
               - 技巧：可以使用汉字谐音辅助或在字母旁加注，例如 “这个假名读作 wa（哇）”。避免 TTS 将 "ha" 读成英语的 "哈(hæ)" 而不是日语的 "哈(ha)"。
               - 对于日语例句，请明确指示 TTS 使用标准日语发音。
            4. **教学风格**：亲和、清晰、循循善诱。
            
            ### TTS Prompt 指令：
            为每一页提供的 tts_prompt 必须强调：
            - "使用标准、清晰的普通话作为主解说语言。"
            - "日语部分需要切换为标准日语口音。"
            
            ### 输出格式：
            请严格返回一个 JSON 数组，数组长度必须与提供的图片数量完全一致：
            [
              {
                "content": "大家好，我是你们的日语老师。今天我们来学习...", 
                "tts_prompt": "亲切的女声，标准普通话，语速适中"
              },
              ...
            ]
            `
        }
    ];

    // 添加所有图片
    for (const imgPath of imagePaths) {
        const imageData = fs.readFileSync(imgPath);
        parts.push({
            inlineData: {
                data: imageData.toString('base64'),
                mimeType: "image/png" // 简单假设，实际需根据后缀
            }
        });
    }

    const result = await model.generateContent(parts);
    const response = await result.response;
    const text = response.text();
    const cleanedText = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleanedText);
}

/**
 * 文本转语音 (使用 Gemini 2.5 Pro TTS REST API - 官方规范版)
 */
async function textToSpeech(text, ttsPrompt, outputPath, voice = 'Aoede') {
    const apiKey = process.env.GEMINI_API_KEY;
    // 使用用户指定的准确模型 ID
    const modelId = 'gemini-2.5-pro-preview-tts';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [
            {
                parts: [
                    { text: text }
                ]
            }
        ],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: {
                        voiceName: voice
                    }
                }
            }
        }
    };

    try {
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        // 官方返回格式：.candidates[0].content.parts[0].inlineData.data
        const candidates = response.data.candidates;
        if (!candidates || candidates.length === 0) {
            throw new Error(`No candidates returned: ${JSON.stringify(response.data)}`);
        }

        const base64Audio = candidates[0].content.parts[0].inlineData.data;
        const audioBuffer = Buffer.from(base64Audio, 'base64');

        // 保存原始 PCM 数据 (Gemini API 返回的是无头的原始数据)
        const tempPcmPath = outputPath + '.pcm';
        fs.writeFileSync(tempPcmPath, audioBuffer);

        // 使用 ffmpeg 转换为标准 MP3 (根据官方文档参数: s16le, 24000Hz, 单声道)
        return new Promise((resolve, reject) => {
            ffmpeg(tempPcmPath)
                .inputOptions([
                    '-f s16le',
                    '-ar 24000',
                    '-ac 1'
                ])
                .save(outputPath)
                .on('end', () => {
                    if (fs.existsSync(tempPcmPath)) fs.unlinkSync(tempPcmPath);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('PCM to MP3 conversion error:', err);
                    reject(err);
                });
        });
    } catch (error) {
        if (error.response && error.response.data) {
            const errorMsg = JSON.stringify(error.response.data);
            console.error('TTS API Error Detail:', errorMsg);
            throw new Error(`TTS API failed (${error.response.status}): ${errorMsg}`);
        }
        throw error;
    }
}

/**
 * 将图片和音频合成为短视频片段
 */
async function createClip(imagePath, audioPath, outputPath) {
    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(imagePath)
            .loop() // 循环图片
            .input(audioPath)
            .videoCodec('libx264')
            .audioCodec('aac')
            .addOption('-r', '25') // 强制固定帧率
            .outputOptions([
                '-tune stillimage',
                '-pix_fmt yuv420p',
                '-shortest', // 以最短流（音频）为准
                '-movflags +faststart'
            ])
            .save(outputPath)
            .on('end', resolve)
            .on('error', (err) => {
                console.error(`Error creating clip for ${imagePath}:`, err);
                reject(err);
            });
    });
}

/**
 * 合并所有视频片段
 */
async function mergeClips(clipPaths, finalOutputPath) {
    const listPath = path.join(path.dirname(finalOutputPath), 'clips.txt');
    const content = clipPaths.map(p => `file '${path.resolve(p)}'`).join('\n');
    fs.writeFileSync(listPath, content);

    return new Promise((resolve, reject) => {
        ffmpeg()
            .input(listPath)
            .inputOptions(['-f concat', '-safe 0'])
            // 移除 copy 模式，改用重新编码以确保拼接处的精准性
            .videoCodec('libx264')
            .audioCodec('aac')
            .outputOptions([
                '-pix_fmt yuv420p',
                '-vsync cfr' // 确保恒定帧率输出
            ])
            .save(finalOutputPath)
            .on('end', resolve)
            .on('error', (err) => {
                console.error('Error merging clips:', err);
                reject(err);
            });
    });
}

/**
 * 将 PDF 转换为图片 (macOS 优化版)
 * 使用 pdf-lib 拆分页面，使用 sips 转换图片
 */
async function convertPDFToImages(filePath, outputDir) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const pdfData = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(pdfData);
    const pageCount = pdfDoc.getPageCount();
    const imageMap = [];

    for (let i = 0; i < pageCount; i++) {
        // 1. 提取当前页为单独的 PDF
        const newPdfDoc = await PDFDocument.create();
        const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [i]);
        newPdfDoc.addPage(copiedPage);
        const pdfBytes = await newPdfDoc.save();

        const tempPdfPath = path.join(outputDir, `temp_page_${i}.pdf`);
        const targetImagePath = path.join(outputDir, `page_${i}.png`);
        fs.writeFileSync(tempPdfPath, pdfBytes);

        // 2. 使用 macOS 自带的 sips 将单页 PDF 转为 PNG
        // sips -s format png temp.pdf --out target.png
        try {
            await execPromise(`sips -s format png "${tempPdfPath}" --out "${targetImagePath}"`);
            imageMap.push(targetImagePath);
        } catch (err) {
            console.error(`Failed to convert page ${i}:`, err);
        } finally {
            // 清理临时 PDF
            if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
        }
    }

    return imageMap;
}

module.exports = {
    extractImagesFromPPTX,
    convertPDFToImages,
    analyzeAllSlides,
    textToSpeech,
    createClip,
    mergeClips
};
