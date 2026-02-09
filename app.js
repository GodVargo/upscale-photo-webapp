/**
 * Upscale Photo - Mini App для Telegram
 * AI-улучшение фото через бесплатные API
 */

// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();

    // Применяем тему Telegram
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

// CORS Proxy для обхода CORS ограничений
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

// Клик на зону загрузки
uploadZone.addEventListener('click', () => {
    fileInput.click();
});

// Выбор файла
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
});

// Обработка выбранного файла
function handleFile(file) {
    // Проверка размера (10MB)
    if (file.size > 10 * 1024 * 1024) {
        showError('Файл слишком большой. Максимум 10MB.');
        return;
    }

    // Проверка типа
    if (!file.type.startsWith('image/')) {
        showError('Пожалуйста, выберите изображение.');
        return;
    }

    selectedFile = file;
    hideError();

    // Показываем превью
    const url = URL.createObjectURL(file);
    previewImg.src = url;

    previewImg.onload = () => {
        imageWidth = previewImg.naturalWidth;
        imageHeight = previewImg.naturalHeight;

        // Обновляем информацию
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = formatSize(file.size);
        document.getElementById('resolution').textContent = `${imageWidth}x${imageHeight}`;

        // Показываем элементы
        uploadZone.style.display = 'none';
        imagePreview.style.display = 'block';
        imageInfo.style.display = 'block';
        options.style.display = 'block';
        upscaleBtn.style.display = 'block';
    };
}

// Выбор масштаба
document.querySelectorAll('.scale-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedScale = parseInt(btn.dataset.scale);
    });
});

// Выбор уровня шумоподавления
document.querySelectorAll('.denoise-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.denoise-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedNoise = parseInt(btn.dataset.noise);
    });
});

// Кнопка улучшения
upscaleBtn.addEventListener('click', startUpscaling);

// Запуск апскейлинга
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

// Обработка изображения через waifu2x API
async function processImage() {
    progressFill.style.width = '10%';
    progressText.textContent = 'Загрузка изображения...';

    // Конвертируем файл в base64
    const base64 = await fileToBase64(selectedFile);

    progressFill.style.width = '30%';
    progressText.textContent = 'Отправка на сервер AI...';

    // Используем DeepAI API (бесплатный)
    const formData = new FormData();
    formData.append('image', selectedFile);

    try {
        // Пробуем DeepAI
        const response = await fetch('https://api.deepai.org/api/waifu2x', {
            method: 'POST',
            headers: {
                'api-key': 'quickstart-QUdJIGlzIGNvbWluZy4uLi4K'
            },
            body: formData
        });

        progressFill.style.width = '60%';
        progressText.textContent = 'Обработка AI...';

        if (!response.ok) {
            throw new Error('Ошибка API');
        }

        const data = await response.json();

        if (data.output_url) {
            progressFill.style.width = '80%';
            progressText.textContent = 'Загрузка результата...';

            // Загружаем результат
            await loadResultImage(data.output_url);
        } else {
            throw new Error('Не удалось получить результат');
        }

    } catch (err) {
        console.log('DeepAI failed, trying alternative...', err);

        // Альтернатива: локальный апскейл через Canvas
        progressText.textContent = 'Локальная обработка...';
        await processLocally();
    }
}

// Локальная обработка через Canvas (fallback)
async function processLocally() {
    progressFill.style.width = '50%';
    progressText.textContent = 'Масштабирование...';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.src = URL.createObjectURL(selectedFile);

    await new Promise((resolve) => {
        img.onload = resolve;
    });

    // Увеличиваем размер
    const newWidth = img.width * selectedScale;
    const newHeight = img.height * selectedScale;

    canvas.width = newWidth;
    canvas.height = newHeight;

    // Используем высококачественную интерполяцию
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    progressFill.style.width = '80%';
    progressText.textContent = 'Применение улучшений...';

    // Применяем шарпенинг
    if (selectedNoise > 0) {
        applySharpening(ctx, newWidth, newHeight);
    }

    progressFill.style.width = '100%';
    progressText.textContent = 'Готово!';

    // Конвертируем в blob и показываем результат
    canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        showResult(url, newWidth, newHeight, true);
    }, 'image/png');
}

// Применение шарпенинга
function applySharpening(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    const factor = selectedNoise * 0.3;
    const kernel = [
        0, -factor, 0,
        -factor, 1 + 4 * factor, -factor,
        0, -factor, 0
    ];

    const tempData = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            for (let c = 0; c < 3; c++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4 + c;
                        sum += tempData[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                    }
                }
                const idx = (y * width + x) * 4 + c;
                data[idx] = Math.min(255, Math.max(0, sum));
            }
        }
    }

    ctx.putImageData(imageData, 0, 0);
}

// Загрузка результата с внешнего URL
async function loadResultImage(url) {
    // Используем CORS proxy
    const proxyUrl = CORS_PROXY + encodeURIComponent(url);

    try {
        const response = await fetch(proxyUrl);
        const blob = await response.blob();
        const localUrl = URL.createObjectURL(blob);

        // Получаем размеры
        const img = new Image();
        img.src = localUrl;
        await new Promise((resolve) => {
            img.onload = resolve;
        });

        progressFill.style.width = '100%';
        progressText.textContent = 'Готово!';

        showResult(localUrl, img.width, img.height, false);
    } catch (err) {
        // Если не удалось загрузить - используем прямой URL
        progressFill.style.width = '100%';
        progressText.textContent = 'Готово!';
        showResult(url, imageWidth * selectedScale, imageHeight * selectedScale, false);
    }
}

// Показать результат
function showResult(url, newWidth, newHeight, isLocal) {
    progressContainer.style.display = 'none';
    imagePreview.style.display = 'none';
    imageInfo.style.display = 'none';
    options.style.display = 'none';
    upscaleBtn.style.display = 'none';

    resultImg.src = url;

    const method = isLocal ? 'Локально (Canvas)' : 'AI (waifu2x)';
    resultInfo.innerHTML = `
        <p>Новое разрешение: <span>${newWidth}x${newHeight}</span></p>
        <p>Увеличение: <span>${selectedScale}x</span> • Метод: <span>${method}</span></p>
    `;

    downloadBtn.href = url;
    downloadBtn.download = `upscaled_${selectedScale}x_${selectedFile.name.replace(/\.[^/.]+$/, '')}.png`;

    resultContainer.style.display = 'block';
    newImageBtn.style.display = 'inline-block';

    // Уведомляем Telegram об успешном завершении
    if (tg) {
        tg.showAlert('✅ Фото успешно улучшено!');
    }
}

// Новое изображение
newImageBtn.addEventListener('click', () => {
    resetUploadState();
    resultContainer.style.display = 'none';
    newImageBtn.style.display = 'none';
    uploadZone.style.display = 'block';
    selectedFile = null;
    fileInput.value = '';
});

// Сброс состояния
function resetUploadState() {
    upscaleBtn.disabled = false;
    upscaleBtn.textContent = '🚀 Улучшить фото';
    progressContainer.style.display = 'none';
    progressFill.style.width = '0%';
}

// Показать ошибку
function showError(message) {
    errorText.textContent = message;
    error.style.display = 'block';
}

// Скрыть ошибку
function hideError() {
    error.style.display = 'none';
}

// Конвертация файла в base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Форматирование размера файла
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

// Обработка закрытия приложения
if (tg) {
    tg.onEvent('viewportChanged', () => {
        // Адаптация к изменению размера
    });
}
