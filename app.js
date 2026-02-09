/**
 * Upscale Photo - Telegram Mini App
 * Улучшение фото через DeepAI + возврат в чат
 */

const DEEPAI_API_KEY = '463910db-7f7d-4bc2-9f3d-76dfbc8038d5';
const CORS_PROXY = 'https://corsproxy.io/?';

// Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();

    // Применяем тему
    const root = document.documentElement;
    root.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color || '#1a1a2e');
    root.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color || '#ffffff');
    root.style.setProperty('--tg-theme-hint-color', tg.themeParams.hint_color || '#8b8b8b');
    root.style.setProperty('--tg-theme-button-color', tg.themeParams.button_color || '#6c5ce7');
    root.style.setProperty('--tg-theme-secondary-bg-color', tg.themeParams.secondary_bg_color || '#16213e');
}

// DOM
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

// Состояние
let selectedFile = null;
let selectedScale = 2;
let selectedNoise = 1;
let imageWidth = 0;
let imageHeight = 0;
let resultDataUrl = null; // Храним как data URL для совместимости
let usedMethod = 'local';

// === ОБРАБОТКА ЗАГРУЗКИ ===

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
    if (file && file.type.startsWith('image/')) handleFile(file);
});

uploadZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
});

function handleFile(file) {
    console.log('📁 Файл выбран:', file.name, file.size);

    if (file.size > 10 * 1024 * 1024) {
        showError('Файл слишком большой. Максимум 10MB.');
        return;
    }

    if (!file.type.startsWith('image/')) {
        showError('Выберите изображение.');
        return;
    }

    selectedFile = file;
    hideError();

    const url = URL.createObjectURL(file);
    previewImg.src = url;

    previewImg.onload = () => {
        imageWidth = previewImg.naturalWidth;
        imageHeight = previewImg.naturalHeight;

        console.log('📏 Размеры:', imageWidth, 'x', imageHeight);

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

// === ОПЦИИ ===

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

// === ОБРАБОТКА ===

upscaleBtn.addEventListener('click', startUpscaling);

async function startUpscaling() {
    if (!selectedFile) return;

    console.log('🚀 Начинаем обработку...');

    upscaleBtn.disabled = true;
    upscaleBtn.textContent = 'Обработка...';
    progressContainer.style.display = 'block';
    hideError();

    try {
        // Пробуем DeepAI
        const apiSuccess = await tryDeepAI();

        if (!apiSuccess) {
            console.log('⚠️ API не сработал, используем локальную обработку');
            await processLocally();
        }
    } catch (err) {
        console.error('❌ Ошибка:', err);
        showError('Ошибка обработки: ' + err.message);
        resetUploadState();
    }
}

// === DeepAI API ===

async function tryDeepAI() {
    try {
        updateProgress(10, 'Подключение к AI серверу...');
        console.log('📤 Отправляем на DeepAI...');

        const formData = new FormData();
        formData.append('image', selectedFile);

        const response = await fetch('https://api.deepai.org/api/waifu2x', {
            method: 'POST',
            headers: { 'api-key': DEEPAI_API_KEY },
            body: formData
        });

        console.log('📥 Ответ API:', response.status);

        if (!response.ok) {
            console.log('❌ API вернул ошибку:', response.status);
            return false;
        }

        const data = await response.json();
        console.log('📦 Данные:', data);

        if (!data.output_url) {
            console.log('❌ Нет URL в ответе');
            return false;
        }

        updateProgress(40, 'AI обрабатывает изображение...');

        // Загружаем результат
        updateProgress(60, 'Загрузка результата...');
        console.log('🔗 Загружаем:', data.output_url);

        const proxyUrl = CORS_PROXY + encodeURIComponent(data.output_url);
        const imgResponse = await fetch(proxyUrl);

        if (!imgResponse.ok) {
            console.log('❌ Не удалось загрузить результат');
            return false;
        }

        const blob = await imgResponse.blob();
        console.log('✅ Получен blob:', blob.size, 'байт');

        // Конвертируем в data URL (работает везде)
        resultDataUrl = await blobToDataUrl(blob);
        usedMethod = 'AI (waifu2x)';

        // Показываем результат
        updateProgress(100, 'Готово!');

        const img = new Image();
        img.src = resultDataUrl;
        await new Promise(r => img.onload = r);

        showResult(img.width, img.height);
        return true;

    } catch (err) {
        console.error('❌ DeepAI ошибка:', err);
        return false;
    }
}

// === ЛОКАЛЬНАЯ ОБРАБОТКА ===

async function processLocally() {
    updateProgress(20, 'Локальная обработка...');
    console.log('🖥️ Локальный апскейл...');

    const img = new Image();
    img.src = URL.createObjectURL(selectedFile);
    await new Promise(r => img.onload = r);

    updateProgress(50, 'Масштабирование...');

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const newWidth = img.width * selectedScale;
    const newHeight = img.height * selectedScale;

    canvas.width = newWidth;
    canvas.height = newHeight;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    updateProgress(80, 'Сохранение...');

    // Получаем data URL
    resultDataUrl = canvas.toDataURL('image/png');
    usedMethod = 'Локально';

    console.log('✅ Локальная обработка завершена');

    updateProgress(100, 'Готово!');
    showResult(newWidth, newHeight);
}

// === РЕЗУЛЬТАТ ===

function showResult(newWidth, newHeight) {
    console.log('🎉 Показываем результат:', newWidth, 'x', newHeight);

    progressContainer.style.display = 'none';
    imagePreview.style.display = 'none';
    imageInfo.style.display = 'none';
    options.style.display = 'none';
    upscaleBtn.style.display = 'none';

    resultImg.src = resultDataUrl;
    resultInfo.innerHTML = `
        <p>Разрешение: <span>${newWidth}x${newHeight}</span></p>
        <p>Метод: <span>${usedMethod}</span></p>
    `;

    resultContainer.style.display = 'block';
    newImageBtn.style.display = 'inline-block';

    if (tg) {
        tg.HapticFeedback.notificationOccurred('success');
    }
}

// === СКАЧИВАНИЕ ===
// В Telegram WebApp обычное скачивание не работает
// Открываем картинку в новой вкладке для ручного сохранения

downloadBtn.addEventListener('click', function (e) {
    e.preventDefault();
    console.log('⬇️ Нажата кнопка скачивания');

    if (!resultDataUrl) {
        alert('Нет изображения для скачивания');
        return;
    }

    // Метод 1: Открываем в новой вкладке (работает в Telegram)
    const newWindow = window.open();
    if (newWindow) {
        newWindow.document.write(`
            <html>
            <head><title>Сохраните изображение</title></head>
            <body style="margin:0; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#1a1a2e;">
                <div style="text-align:center; color:white; font-family:sans-serif;">
                    <p style="margin-bottom:20px;">📱 Зажмите картинку и выберите "Сохранить"</p>
                    <img src="${resultDataUrl}" style="max-width:100%; max-height:80vh;">
                </div>
            </body>
            </html>
        `);
        newWindow.document.close();
    } else {
        // Fallback: показываем alert с инструкцией
        if (tg) {
            tg.showAlert('Зажмите картинку выше и выберите "Сохранить изображение"');
        } else {
            alert('Зажмите картинку и выберите "Сохранить изображение"');
        }
    }
});

// === НОВОЕ ИЗОБРАЖЕНИЕ ===

newImageBtn.addEventListener('click', () => {
    resetUploadState();
    resultContainer.style.display = 'none';
    newImageBtn.style.display = 'none';
    uploadZone.style.display = 'block';
    selectedFile = null;
    resultDataUrl = null;
    fileInput.value = '';
});

// === УТИЛИТЫ ===

function updateProgress(percent, text) {
    progressFill.style.width = percent + '%';
    progressText.textContent = text;
}

function resetUploadState() {
    upscaleBtn.disabled = false;
    upscaleBtn.textContent = '🚀 Улучшить фото';
    progressContainer.style.display = 'none';
    progressFill.style.width = '0%';
}

function showError(msg) {
    errorText.textContent = msg;
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

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// === TELEGRAM СОБЫТИЯ ===
if (tg) {
    tg.onEvent('viewportChanged', () => { });
}

console.log('✅ Upscale Photo WebApp загружен');


