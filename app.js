/**
 * Upscale Photo - Telegram Mini App
 * WebApp → Backend → DeepAI → Бот → Пользователь
 */

// URL бэкенда на Railway (будет заменён после деплоя)
const BACKEND_URL = 'https://UpscalerPhoto.up.railway.app';

// Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();

    // Тема
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
let resultDataUrl = null;
let usedMethod = 'local';

// === ЗАГРУЗКА ФАЙЛА ===

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
    console.log('📁 Файл:', file.name, formatSize(file.size));

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

    upscaleBtn.disabled = true;
    upscaleBtn.textContent = 'Обработка...';
    progressContainer.style.display = 'block';
    hideError();

    try {
        // Сначала пробуем через наш бэкенд
        const success = await tryBackendAPI();

        if (!success) {
            console.log('⚠️ Backend недоступен, локальная обработка');
            await processLocally();
        }
    } catch (err) {
        console.error('❌ Ошибка:', err);
        showError('Ошибка: ' + err.message);
        resetUploadState();
    }
}

// === ОТПРАВКА НА НАШ БЭКЕНД ===

async function tryBackendAPI() {
    try {
        updateProgress(10, 'Подключение к серверу...');
        console.log('� Отправляем на бэкенд:', BACKEND_URL);

        const formData = new FormData();
        formData.append('image', selectedFile);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 сек таймаут

        const response = await fetch(BACKEND_URL + '/upscale', {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log('� Ответ сервера:', response.status);

        if (!response.ok) {
            console.log('❌ Сервер вернул ошибку');
            return false;
        }

        updateProgress(50, 'AI обрабатывает фото...');

        const data = await response.json();
        console.log('� Данные:', data);

        if (!data.success || !data.image_base64) {
            console.log('❌ Нет результата в ответе');
            return false;
        }

        updateProgress(90, 'Загрузка результата...');

        resultDataUrl = data.image_base64;
        usedMethod = 'AI (waifu2x)';

        // Получаем размеры
        const img = new Image();
        img.src = resultDataUrl;
        await new Promise(r => img.onload = r);

        updateProgress(100, 'Готово!');
        showResult(img.width, img.height);

        return true;

    } catch (err) {
        console.error('❌ Ошибка бэкенда:', err);
        return false;
    }
}

// === ЛОКАЛЬНАЯ ОБРАБОТКА (FALLBACK) ===

async function processLocally() {
    updateProgress(20, 'Локальная обработка...');
    console.log('🖥️ Локальный апскейл');

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

    resultDataUrl = canvas.toDataURL('image/png');
    usedMethod = 'Локально';

    updateProgress(100, 'Готово!');
    showResult(newWidth, newHeight);
}

// === ПОКАЗ РЕЗУЛЬТАТА ===

function showResult(newWidth, newHeight) {
    console.log('🎉 Результат:', newWidth, 'x', newHeight, '| Метод:', usedMethod);

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
        tg.HapticFeedback?.notificationOccurred?.('success');
    }
}

// === ОТПРАВКА В ЧАТ (ОСНОВНОЙ СПОСОБ ПОЛУЧИТЬ ФАЙЛ) ===

downloadBtn.addEventListener('click', function (e) {
    e.preventDefault();
    console.log('📤 Отправка в чат...');

    if (!resultDataUrl) {
        alert('Нет изображения');
        return;
    }

    if (tg && tg.sendData) {
        // Отправляем данные боту
        const payload = JSON.stringify({
            action: 'send_result',
            image: resultDataUrl
        });

        console.log('📨 Отправляем данные боту, размер:', payload.length);

        try {
            tg.sendData(payload);
            // WebApp закроется автоматически после sendData
        } catch (err) {
            console.error('❌ Ошибка sendData:', err);
            // Fallback: открываем в новой вкладке
            openInNewTab();
        }
    } else {
        // Не в Telegram — открываем в новой вкладке
        openInNewTab();
    }
});

function openInNewTab() {
    const newWindow = window.open();
    if (newWindow) {
        newWindow.document.write(`
            <html>
            <head><title>Сохраните изображение</title></head>
            <body style="margin:0; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; background:#1a1a2e; color:white; font-family:sans-serif;">
                <p style="margin-bottom:20px;">📱 Зажмите картинку → "Сохранить"</p>
                <img src="${resultDataUrl}" style="max-width:95%; max-height:80vh;">
            </body>
            </html>
        `);
        newWindow.document.close();
    }
}

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

if (tg) {
    tg.onEvent?.('viewportChanged', () => { });
}

console.log('✅ Upscale Photo WebApp загружен');
console.log('🔗 Backend:', BACKEND_URL);
