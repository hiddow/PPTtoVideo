const fileInput = document.getElementById('file-input');
const selectBtn = document.getElementById('select-btn');
const processBtn = document.getElementById('process-btn');
const fileNameDisplay = document.getElementById('file-name');
const uploadZone = document.getElementById('upload-zone');
const statusZone = document.getElementById('status-zone');
const resultZone = document.getElementById('result-zone');
const progressBar = document.getElementById('progress-bar');
const statusText = document.getElementById('status-text');
const finalVideo = document.getElementById('final-video');
const downloadLink = document.getElementById('download-link');
const restartBtn = document.getElementById('restart-btn');

let selectedFile = null;

selectBtn.onclick = () => fileInput.click();
uploadZone.onclick = (e) => {
    // 如果点击的是“开始合成”按钮或音色选择区域，不触发文件选择
    if (e.target.closest('#file-info')) return;
    fileInput.click();
};

fileInput.onchange = (e) => {
    selectedFile = e.target.files[0];
    if (selectedFile) {
        fileNameDisplay.textContent = selectedFile.name;
        document.getElementById('file-info').classList.remove('hidden');
        selectBtn.classList.add('hidden');
    }
};

processBtn.onclick = async () => {
    if (!selectedFile) return;

    // 切换 UI
    uploadZone.classList.add('hidden');
    statusZone.classList.remove('hidden');

    const formData = new FormData();
    formData.append('pptx', selectedFile);
    formData.append('voice', document.getElementById('voice-select').value);

    try {
        // 模拟进度 (因为后端目前是一次性返回，实际可以改成 EventSource 或 Socket)
        let progress = 0;
        const interval = setInterval(() => {
            progress += 1;
            if (progress > 95) clearInterval(interval);
            progressBar.style.width = `${progress}%`;
        }, 500);

        const response = await fetch('http://localhost:3001/api/convert', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        clearInterval(interval);
        progressBar.style.width = '100%';

        if (response.ok) {
            showResult(result.videoUrl);
        } else {
            console.error('Server error response:', result);
            alert(`处理失败: ${result.message || '未知错误'}`);
            resetUI();
        }
    } catch (err) {
        console.error('Fetch error:', err);
        clearInterval(interval);
        alert('请求出错，请检查网络或后端日志');
        resetUI();
    }
};

function showResult(videoUrl) {
    statusZone.classList.add('hidden');
    resultZone.classList.remove('hidden');
    const fullUrl = `http://localhost:3001${videoUrl}`;
    finalVideo.src = fullUrl;
    downloadLink.href = fullUrl;
}

function resetUI() {
    uploadZone.classList.remove('hidden');
    statusZone.classList.add('hidden');
    resultZone.classList.add('hidden');
    fileInput.value = '';
    selectBtn.classList.remove('hidden');
    document.getElementById('file-info').classList.add('hidden');
}

restartBtn.onclick = resetUI;
