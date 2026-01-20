// ========== ОСНОВНЫЕ НАСТРОЙКИ ==========
const CONFIG = {
    INITIAL_TIME: 60,
    INITIAL_LIVES: 3,
    MIN_OBJECTS: 12,
    MAX_OBJECTS: 25,
    PLATFORM_RADIUS: 24,
    PLAY_AREA: {
        x: { min: -22, max: 22 },
        y: { min: 2, max: 15 },
        z: { min: -22, max: 22 }
    }
};

// ========== ИГРА ==========
const Game = {
    // Состояние игры
    state: {
        score: 0,
        timeLeft: CONFIG.INITIAL_TIME,
        lives: CONFIG.INITIAL_LIVES,
        active: false,
        objectsCount: 0,
        collected: 0,
        hoveredObject: null,
        outOfBounds: false,
        warningTimeout: null
    },
    
    // Таймеры
    timers: {
        game: null,
        raycast: null,
        boundary: null
    },
    
    // Инициализация
    init() {
        console.log('🎮 Инициализация игры');
        
        // Ждем загрузки A-Frame
        const scene = document.querySelector('a-scene');
        if (scene.hasLoaded) {
            this.start();
        } else {
            scene.addEventListener('loaded', () => this.start());
        }
    },
    
    // Начать игру
    start() {
        console.log('🚀 Начало игры');
        
        this.resetState();
        this.state.active = true;
        
        // Создать фигурки
        this.createObjects();
        
        // Запустить таймеры
        this.startGameTimer();
        this.startRaycastCheck();
        this.startBoundaryCheck();
        
        // Настроить обработчики
        this.setupEventListeners();
        
        // Обновить интерфейс
        this.updateUI();
        
        // Активировать курсор
        this.setupCursor();
    },
    
    // Сброс состояния
    resetState() {
        this.state = {
            score: 0,
            timeLeft: CONFIG.INITIAL_TIME,
            lives: CONFIG.INITIAL_LIVES,
            active: false,
            objectsCount: 0,
            collected: 0,
            hoveredObject: null,
            outOfBounds: false,
            warningTimeout: null
        };
        
        // Очистить сцену
        this.clearObjects();
    },
    
    // ========== СОЗДАНИЕ ФИГУРОК ==========
    createObjects() {
        const playArea = document.getElementById('play-area');
        const shapes = this.getShapes();
        
        for (let i = 0; i < CONFIG.MIN_OBJECTS; i++) {
            this.createRandomObject(playArea, shapes);
        }
        
        this.state.objectsCount = CONFIG.MIN_OBJECTS;
    },
    
    getShapes() {
        return [
            { type: 'sphere', color: '#FF5555', size: 0.8, points: 10 },
            { type: 'box', color: '#55FF55', size: 1.0, points: 15 },
            { type: 'cylinder', color: '#5555FF', size: 0.9, points: 12 },
            { type: 'cone', color: '#FF55FF', size: 1.1, points: 20 },
            { type: 'torus', color: '#FFFF55', size: 0.7, points: 25 }
        ];
    },
    
    createRandomObject(parent, shapes) {
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        const element = document.createElement('a-' + shape.type);
        
        // Случайная позиция
        const posX = this.random(CONFIG.PLAY_AREA.x.min, CONFIG.PLAY_AREA.x.max);
        const posY = this.random(CONFIG.PLAY_AREA.y.min, CONFIG.PLAY_AREA.y.max);
        const posZ = this.random(CONFIG.PLAY_AREA.z.min, CONFIG.PLAY_AREA.z.max);
        
        // Базовые свойства
        element.setAttribute('class', 'collectible');
        element.setAttribute('position', `${posX} ${posY} ${posZ}`);
        element.setAttribute('color', shape.color);
        element.setAttribute('data-points', shape.points);
        element.setAttribute('data-color', shape.color);
        
        // Размеры
        if (shape.type === 'sphere') {
            element.setAttribute('radius', shape.size);
        } else if (shape.type === 'box') {
            element.setAttribute('width', shape.size);
            element.setAttribute('height', shape.size);
            element.setAttribute('depth', shape.size);
        } else if (shape.type === 'cylinder') {
            element.setAttribute('radius', shape.size * 0.8);
            element.setAttribute('height', shape.size * 1.5);
        } else if (shape.type === 'cone') {
            element.setAttribute('radius-bottom', shape.size * 0.8);
            element.setAttribute('height', shape.size * 1.5);
        } else if (shape.type === 'torus') {
            element.setAttribute('radius', shape.size);
            element.setAttribute('radius-tubular', shape.size * 0.2);
        }
        
        // Анимация вращения
        element.setAttribute('animation', {
            property: 'rotation',
            to: '0 360 0',
            loop: true,
            dur: this.random(4000, 10000),
            easing: 'linear'
        });
        
        // Анимация плавания
        element.setAttribute('animation__float', {
            property: 'position',
            to: `${posX} ${posY + 1.5} ${posZ}`,
            dir: 'alternate',
            loop: true,
            dur: this.random(3000, 6000),
            easing: 'easeInOutSine'
        });
        
        // Обработчик клика
        element.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.state.active) {
                this.collectObject(element);
            }
        });
        
        parent.appendChild(element);
        return element;
    },
    
    // ========== УПРАВЛЕНИЕ МЫШЬЮ И СБОР ==========
    setupCursor() {
        // Добавляем обработчик клика на документ
        document.addEventListener('click', (e) => {
            if (!this.state.active) return;
            
            // Анимация прицела
            this.animateCrosshair();
            
            // Если есть объект под курсором - собрать его
            if (this.state.hoveredObject) {
                this.collectObject(this.state.hoveredObject);
            }
        });
        
        // Также обрабатываем клики напрямую по объектам
        document.querySelectorAll('.collectible').forEach(obj => {
            obj.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.state.active) {
                    this.collectObject(obj);
                }
            });
        });
    },
    
    // Проверка наведения луча
    startRaycastCheck() {
        this.timers.raycast = setInterval(() => {
            if (!this.state.active) return;
            
            const camera = document.querySelector('#main-camera');
            if (!camera || !camera.components.raycaster) return;
            
            // Получаем луч из камеры
            const raycaster = camera.components.raycaster;
            raycaster.refreshObjects();
            
            // Находим пересечения
            const intersections = raycaster.intersections;
            const collectible = intersections.find(i => 
                i.object.el.classList.contains('collectible')
            );
            
            if (collectible) {
                const obj = collectible.object.el;
                
                // Если новый объект под курсором
                if (this.state.hoveredObject !== obj) {
                    // Сбрасываем предыдущий
                    if (this.state.hoveredObject) {
                        this.resetObjectHighlight(this.state.hoveredObject);
                    }
                    
                    // Подсвечиваем новый
                    this.state.hoveredObject = obj;
                    this.highlightObject(obj);
                }
            } else {
                // Сбрасываем если ничего не наведено
                if (this.state.hoveredObject) {
                    this.resetObjectHighlight(this.state.hoveredObject);
                    this.state.hoveredObject = null;
                }
            }
        }, 50);
    },
    
    highlightObject(obj) {
        const originalColor = obj.getAttribute('data-color') || obj.getAttribute('color');
        obj.setAttribute('material', 'color', '#FFFFFF');
        obj.setAttribute('material', 'emissive', originalColor);
        obj.setAttribute('material', 'emissiveIntensity', 0.3);
        
        // Пульсация
        obj.setAttribute('animation__pulse', {
            property: 'scale',
            from: '1 1 1',
            to: '1.1 1.1 1.1',
            dir: 'alternate',
            loop: true,
            dur: 500,
            easing: 'easeInOutSine'
        });
    },
    
    resetObjectHighlight(obj) {
        const originalColor = obj.getAttribute('data-color') || obj.getAttribute('color');
        obj.setAttribute('material', 'color', originalColor);
        obj.setAttribute('material', 'emissive', '#000000');
        obj.setAttribute('material', 'emissiveIntensity', 0);
        obj.removeAttribute('animation__pulse');
    },
    
    // Сбор объекта
    collectObject(obj) {
        if (!this.state.active || !obj) return;
        
        const points = parseInt(obj.getAttribute('data-points')) || 10;
        const color = obj.getAttribute('data-color') || '#FFFFFF';
        
        // Увеличить счет
        this.state.score += points;
        this.state.collected++;
        
        // Эффект сбора
        this.playCollectEffect(points, color);
        
        // Удалить объект
        this.removeObject(obj);
        
        // Создать новый
        if (this.state.objectsCount < CONFIG.MAX_OBJECTS) {
            const playArea = document.getElementById('play-area');
            const shapes = this.getShapes();
            this.createRandomObject(playArea, shapes);
            this.state.objectsCount++;
        }
        
        // Обновить интерфейс
        this.updateUI();
    },
    
    removeObject(obj) {
        if (obj && obj.parentNode) {
            // Эффект исчезновения
            obj.setAttribute('animation', {
                property: 'scale',
                from: obj.getAttribute('scale') || '1 1 1',
                to: '0 0 0',
                dur: 300,
                easing: 'easeInBack'
            });
            
            setTimeout(() => {
                if (obj.parentNode) {
                    obj.parentNode.removeChild(obj);
                    this.state.objectsCount--;
                    
                    if (this.state.hoveredObject === obj) {
                        this.state.hoveredObject = null;
                    }
                }
            }, 300);
        }
    },
    
    // ========== ГРАНИЦЫ И ЖИЗНИ ==========
    startBoundaryCheck() {
        this.timers.boundary = setInterval(() => {
            if (!this.state.active) return;
            
            const player = document.querySelector('#player');
            if (!player) return;
            
            const pos = player.getAttribute('position');
            const distance = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
            
            // Проверка выхода за границы
            if (distance > CONFIG.PLATFORM_RADIUS) {
                if (!this.state.outOfBounds) {
                    this.state.outOfBounds = true;
                    this.showBoundaryWarning(true);
                    
                    // Таймер потери жизни
                    this.state.warningTimeout = setTimeout(() => {
                        if (this.state.outOfBounds && this.state.active) {
                            this.loseLife();
                        }
                    }, 3000);
                }
            } else {
                if (this.state.outOfBounds) {
                    this.state.outOfBounds = false;
                    this.showBoundaryWarning(false);
                    clearTimeout(this.state.warningTimeout);
                }
            }
        }, 200);
    },
    
    loseLife() {
        if (!this.state.active) return;
        
        this.state.lives--;
        this.updateUI();
        
        // Возврат в центр
        const player = document.querySelector('#player');
        if (player) {
            player.setAttribute('position', '0 3 5');
        }
        
        // Эффект
        this.playLifeLostEffect();
        
        // Проверка на конец игры
        if (this.state.lives <= 0) {
            this.endGame('no_lives');
        }
    },
    
    // ========== ТАЙМЕР ИГРЫ ==========
    startGameTimer() {
        clearInterval(this.timers.game);
        
        this.timers.game = setInterval(() => {
            if (!this.state.active) return;
            
            this.state.timeLeft--;
            document.getElementById('timer-value').textContent = this.state.timeLeft;
            
            // Визуальные эффекты
            if (this.state.timeLeft <= 10) {
                const timerEl = document.getElementById('timer-value');
                timerEl.style.color = '#FF5555';
                
                if (this.state.timeLeft <= 5) {
                    timerEl.style.animation = 'pulse 0.5s infinite';
                }
            }
            
            // Конец игры
            if (this.state.timeLeft <= 0) {
                this.endGame('time_up');
            }
        }, 1000);
    },
    
    // ========== ЭФФЕКТЫ ==========
    playCollectEffect(points, color) {
        // Эффект прицела
        this.animateCrosshair();
        
        // Всплывающие очки
        const effect = document.createElement('div');
        effect.className = 'collect-effect';
        effect.textContent = `+${points}`;
        effect.style.color = color;
        effect.style.left = '50%';
        effect.style.top = '50%';
        
        document.body.appendChild(effect);
        
        setTimeout(() => {
            effect.remove();
        }, 1000);
    },
    
    animateCrosshair() {
        const crosshair = document.getElementById('crosshair');
        crosshair.style.transform = 'translate(-50%, -50%) scale(1.3)';
        
        setTimeout(() => {
            crosshair.style.transform = 'translate(-50%, -50%) scale(1)';
        }, 150);
    },
    
    playLifeLostEffect() {
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(255, 0, 0, 0.3);
            z-index: 9997;
            pointer-events: none;
        `;
        
        document.body.appendChild(flash);
        
        setTimeout(() => {
            flash.style.opacity = '0';
            flash.style.transition = 'opacity 0.5s';
            setTimeout(() => flash.remove(), 500);
        }, 200);
    },
    
    showBoundaryWarning(show) {
        const warning = document.getElementById('warning');
        warning.style.display = show ? 'block' : 'none';
    },
    
    // ========== ИНТЕРФЕЙС ==========
    updateUI() {
        document.getElementById('score-value').textContent = this.state.score;
        document.getElementById('timer-value').textContent = this.state.timeLeft;
        
        // Жизни
        const lives = document.querySelectorAll('#lives-container .life');
        lives.forEach((life, index) => {
            if (index < this.state.lives) {
                life.classList.remove('lost');
            } else {
                life.classList.add('lost');
            }
        });
    },
    
    clearObjects() {
        const playArea = document.getElementById('play-area');
        const objects = playArea.querySelectorAll('.collectible');
        objects.forEach(obj => obj.remove());
        this.state.objectsCount = 0;
    },
    
    // ========== КОНЕЦ ИГРЫ ==========
    endGame(reason) {
        this.state.active = false;
        
        // Остановить все таймеры
        Object.values(this.timers).forEach(timer => {
            if (timer) clearInterval(timer);
        });
        
        clearTimeout(this.state.warningTimeout);
        
        // Показать кнопку перезапуска
        document.getElementById('restart-btn').style.display = 'block';
        
        // Сообщение
        let message = '';
        if (reason === 'time_up') {
            message = '⏰ Время вышло!';
        } else if (reason === 'no_lives') {
            message = '💔 Закончились жизни!';
        }
        
        alert(`${message}\n\nИтоговый счёт: ${this.state.score}\nСобрано фигурок: ${this.state.collected}`);
    },
    
    // ========== ОБРАБОТЧИКИ ==========
    setupEventListeners() {
        // Клавиша R для перезапуска
        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' || e.key === 'R') {
                this.restart();
            }
        });
        
        // ESC для выхода из PointerLock
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.exitPointerLock();
            }
        });
    },
    
    // ========== ПЕРЕЗАПУСК ==========
    restart() {
        console.log('🔄 Перезапуск игры');
        
        // Остановить все
        Object.values(this.timers).forEach(timer => {
            if (timer) clearInterval(timer);
        });
        
        clearTimeout(this.state.warningTimeout);
        
        // Скрыть UI элементы
        document.getElementById('restart-btn').style.display = 'none';
        this.showBoundaryWarning(false);
        
        // Запустить новую игру
        this.start();
    },
    
    // ========== ВСПОМОГАТЕЛЬНЫЕ ==========
    random(min, max) {
        return min + Math.random() * (max - min);
    }
};

// ========== ЗАПУСК ИГРЫ ==========
// Ждем загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
    // Добавляем CSS для анимаций
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
    `;
    document.head.appendChild(style);
    
    // Запускаем игру
    setTimeout(() => {
        Game.init();
        window.game = Game;
    }, 500);
});