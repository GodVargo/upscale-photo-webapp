/**
 * Upscale Photo - Mini App для Telegram
 * AI-улучшение фото через DeepAI waifu2x
 */

// DeepAI API ключ
const DEEPAI_API_KEY = '463910db-7f7d-4bc2-9f3d-76dfbc8038d5';

// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();

    document.documentElement.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color || '#1a1a2e');
    document.documentElement.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color || '#ffffff');
    document.documentElement.style.setProperty('--tg-theme-hint-color', tg.themeParams.hint_color || '#8b8b8b');
    document.documentElement.style.setProperty('--tg-theme-button-color', tg.themeParams.button_color || '#6c5ce7');
    document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', tg.themeParams.secondary_bg_color || '#16213e');
}

// DOM элементы
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const imageInfo = document.getElementById('imageInfo');
const options = document.getElementById('options');
const upscaleBtn = document.getElementById('upscaleBtn');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const resultContainer = document.getElementById('resultContainer');
const resultImg = document.getElementById('resultImg');
const resultInfo = document.getElementById('resultInfo');
const downloadBtn = document.getElementById('downloadBtn');
const newImageBtn = document.getElementById('newImageBtn');
const error = document.getElementById('error');
const errorText = document.getElementById('errorText');

// Состояние приложения
let selectedFile = null;
let selectedScale = 2;
let selectedNoise = 1;
let imageWidth = 0;
let imageHeight = 0;
let resultBlob = null;
let usedMethod = 'local';

// CORS Proxy
const CORS_PROXY = 'https://corsproxy.io/?';

// Обработка drag & drop
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        handleFile(file);
    }
});

uploadZone.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
});

function handleFile(file) {
    if (file.size > 10 * 1024 * 1024) {
        showError('Файл слишком большой. Максимум 10MB.');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showError('Пожалуйста, выберите изображение.');
        return;
    }

    selectedFile = file;
    hideError();

    const url = URL.createObjectURL(file);
    previewImg.src = url;

    previewImg.onload = () => {
        imageWidth = previewImg.naturalWidth;
        imageHeight = previewImg.naturalHeight;

        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = formatSize(file.size);
        document.getElementById('resolution').textContent = `${imageWidth}x${imageHeight}`;

        uploadZone.style.display = 'none';
        imagePreview.style.display = 'block';
        imageInfo.style.display = 'block';
        options.style.display = 'block';
        upscaleBtn.style.display = 'block';
    };
}

document.querySelectorAll('.scale-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedScale = parseInt(btn.dataset.scale);
    });
});

document.querySelectorAll('.denoise-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.denoise-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedNoise = parseInt(btn.dataset.noise);
    });
});

upscaleBtn.addEventListener('click', startUpscaling);

async function startUpscaling() {
    if (!selectedFile) return;

    upscaleBtn.disabled = true;
    upscaleBtn.textContent = 'Обработка...';
    progressContainer.style.display = 'block';
    hideError();

    try {
        await processImage();
    } catch (err) {
        console.error('Upscaling error:', err);
        showError(`Ошибка: ${err.message}`);
        resetUploadState();
    }
}

// Основная обработка через DeepAI
async function processImage() {
    progressFill.style.width = '10%';
    progressText.textContent = 'Подготовка изображения...';

    try {
        // Пробуем DeepAI waifu2x
        progressFill.style.width = '20%';
        progressText.textContent = 'Отправка на AI сервер...';

        const formData = new FormData();
        formData.append('image', selectedFile);

        const response = await fetch('https://api.deepai.org/api/waifu2x', {
            method: 'POST',
            headers: {
                'api-key': DEEPAI_API_KEY
            },
            body: formData
        });

        progressFill.style.width = '50%';
        progressText.textContent = 'AI обрабатывает изображение...';

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        console.log('DeepAI response:', data);

        if (data.output_url) {
            progressFill.style.width = '70%';
            progressText.textContent = 'Загрузка результата...';

            // Загружаем результат через CORS proxy
            const proxyUrl = CORS_PROXY + encodeURIComponent(data.output_url);
            const imgResponse = await fetch(proxyUrl);
            const blob = await imgResponse.blob();

            resultBlob = blob;
            usedMethod = 'AI (waifu2x)';

            // Получаем размеры результата
            const resultUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.src = resultUrl;

            await new Promise((resolve) => {
                img.onload = resolve;
            });

            progressFill.style.width = '100%';
            progressText.textContent = 'Готово!';

            showResult(resultUrl, img.width, img.height);
        } else {
            throw new Error('Не получен URL результата');
        }

    } catch (err) {
        console.log('DeepAI failed, using local processing:', err);

        // Fallback на локальную обработку
        progressText.textContent = 'Локальная обработка...';
        await processLocally();
    }
}

// Локальная обработка (fallback)
async function processLocally() {
    progressFill.style.width = '40%';
    progressText.textContent = 'Масштабирование...';

    const img = new Image();
    img.src = URL.createObjectURL(selectedFile);

    await new Promise((resolve) => {
        img.onload = resolve;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const newWidth = img.width * selectedScale;
    const newHeight = img.height * selectedScale;

    canvas.width = newWidth;
    canvas.height = newHeight;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    progressFill.style.width = '60%';
    progressText.textContent = 'Улучшение чёткости...';

    await delay(300);

    if (selectedNoise > 0) {
        applyUnsharpMask(ctx, newWidth, newHeight, selectedNoise);
    }

    progressFill.style.width = '80%';
    progressText.textContent = 'Финальная обработка...';

    await delay(200);
    applyContrastEnhancement(ctx, newWidth, newHeight);

    progressFill.style.width = '100%';
    progressText.textContent = 'Готово!';

    const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/png', 1.0);
    });

    resultBlob = blob;
    usedMethod = 'Локально (Canvas)';

    const resultUrl = URL.createObjectURL(blob);
    showResult(resultUrl, newWidth, newHeight);
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function applyUnsharpMask(ctx, width, height, strength) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const tempData = new Uint8ClampedArray(data);

    const amount = 0.3 + (strength * 0.2);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            for (let c = 0; c < 3; c++) {
                const idx = (y * width + x) * 4 + c;
                const blur = (
                    tempData[((y - 1) * width + x) * 4 + c] +
                    tempData[((y + 1) * width + x) * 4 + c] +
                    tempData[(y * width + x - 1) * 4 + c] +
                    tempData[(y * width + x + 1) * 4 + c]
                ) / 4;

                const original = tempData[idx];
                const diff = original - blur;
                data[idx] = Math.min(255, Math.max(0, original + diff * amount));
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

function applyContrastEnhancement(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const contrast = 1.05;
    const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

    for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
        data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
        data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
    }

    ctx.putImageData(imageData, 0, 0);
}

function showResult(url, newWidth, newHeight) {
    progressContainer.style.display = 'none';
    imagePreview.style.display = 'none';
    imageInfo.style.display = 'none';
    options.style.display = 'none';
    upscaleBtn.style.display = 'none';

    resultImg.src = url;

    resultInfo.innerHTML = `
        <p>Новое разрешение: <span>${newWidth}x${newHeight}</span></p>
        <p>Метод: <span>${usedMethod}</span></p>
    `;

    resultContainer.style.display = 'block';
    newImageBtn.style.display = 'inline-block';

    if (tg) {
        tg.showAlert('✅ Фото успешно улучшено!');
    }
}

// Скачивание
downloadBtn.addEventListener('click', (e) => {
    e.preventDefault();

    if (!resultBlob) {
        alert('Нет изображения для скачивания');
        return;
    }

    const filename = `upscaled_${Date.now()}.png`;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
});

newImageBtn.addEventListener('click', () => {
    resetUploadState();
    resultContainer.style.display = 'none';
    newImageBtn.style.display = 'none';
    uploadZone.style.display = 'block';
    selectedFile = null;
    resultBlob = null;
    fileInput.value = '';
});

function resetUploadState() {
    upscaleBtn.disabled = false;
    upscaleBtn.textContent = '🚀 Улучшить фото';
    progressContainer.style.display = 'none';
    progressFill.style.width = '0%';
}

function showError(message) {
    errorText.textContent = message;
    error.style.display = 'block';
}

function hideError() {
    error.style.display = 'none';
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

if (tg) {
    tg.onEvent('viewportChanged', () => { });
}

