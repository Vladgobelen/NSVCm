
/*
  Файл-патч для обеспечения максимальной совместимости воспроизведения голоса
  в разных браузерах (Chrome, Edge, Opera, Yandex, Firefox, Safari и др.)
  ---------------------------------------------------------------
  Правила:
  - Не менять существующий код приложения.
  - Добавляем вспомогательную библиотеку и экспортируем функцию
    attachRemoteStream(stream, {userId})
  - Комментарии — на русском языке.
  ---------------------------------------------------------------
  Что делает:
  1) Создаёт/переиспользует общий AudioContext (если поддерживается),
     чтобы обеспечить единообразную обработку потоков в Chrome/Edge/Opera.
  2) Для Safari применяет дополнительный "toggle mute" хак, т.к. в некоторых
     версиях Safari звук начинает идти только после включения/выключения микрофона.
  3) Если автоматический запуск блокируется политиками автопроигрывания,
     ставит одноразовые слушатели пользовательских действий (click/keydown),
     которые возобновляют AudioContext и пытаются запустить все аудиоэлементы.
  4) Возвращает объект с возможностью управлять громкостью и узлами WebAudio.
  ---------------------------------------------------------------
  Использование (пример):
    const obj = window._voiceCompat.attachRemoteStream(stream, { userId: 'user123' });
    // obj.element — HTMLAudioElement
    // obj.setVolume(0.5) — управление громкостью
*/

(function(){
  // экспорт пространства имён
  window._voiceCompat = window._voiceCompat || {};
  // кроссбраузерный конструктор AudioContext
  const AC = window.AudioContext || window.webkitAudioContext || null;

  // определить Safari (не Chrome, не Android)
  const isSafari = (function(){
    const ua = navigator.userAgent;
    return /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Android/.test(ua);
  })();

  // Создать общий AudioContext, если возможно. Некоторые браузеры требуют
  // пользовательского жеста для resume() — обработаем ниже.
  if (!window._voiceCompat.audioContext && AC) {
    try {
      window._voiceCompat.audioContext = new AC();
    } catch (e) {
      console.warn('Не удалось создать AudioContext:', e);
      window._voiceCompat.audioContext = null;
    }
  }

  // Вспомогательная функция: попытаться возобновить аудиоконтекст и воспроизвести элементы
  function resumeAudioContextAndElements() {
    try {
      if (window._voiceCompat.audioContext && window._voiceCompat.audioContext.state === 'suspended') {
        window._voiceCompat.audioContext.resume().catch(()=>{});
      }
    } catch(e){/* ignore */}
    // попытка воспроизвести все audio элементы (без гарантии)
    try {
      document.querySelectorAll('audio').forEach(a=>{
        // некоторые браузеры выбрасывают исключение, если play вызван без жеста — игнорируем
        a.play && a.play().catch(()=>{});
      });
    } catch(e){}
  }

  // Установить одноразовые слушатели пользовательского взаимодействия, чтобы снять блокировку autoplay
  function ensureResumeOnUserGesture() {
    if (window._voiceCompat._gestureListenerAdded) return;
    const resume = function(){
      resumeAudioContextAndElements();
      window.removeEventListener('click', resume);
      window.removeEventListener('keydown', resume);
    };
    window.addEventListener('click', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    window._voiceCompat._gestureListenerAdded = true;
  }

  // Основная экспортируемая функция:
  // attachRemoteStream(stream, { userId: 'id' })
  window._voiceCompat.attachRemoteStream = function(stream, opts){
    opts = opts || {};
    const userId = opts.userId || ('u' + Math.random().toString(36).slice(2));

    // Создадим HTMLAudioElement для совместимости с Safari и для удобства управления DOM
    const audio = document.createElement('audio');
    audio.id = 'remote-audio-' + userId;
    audio.autoplay = true;
    audio.playsInline = true; // важно для мобильных Safari/Chrome
    audio.dataset.voiceCompat = '1';
    audio.style.display = 'none'; // визуально скрываем, DOM элемент нужен для работы браузера
    audio.volume = 1.0;

    // Присваиваем поток напрямую — это работает в большинстве браузеров.
    try {
      audio.srcObject = stream;
    } catch (e) {
      // старые браузеры: использовать URL.createObjectURL (редко нужно)
      try {
        audio.src = URL.createObjectURL(stream);
      } catch (e2) { console.warn('Не удалось назначить srcObject для audio', e2); }
    }

    // Добавим в документ (перед подключением WebAudio)
    document.body.appendChild(audio);

    // Если это Safari — иногда помогает краткое приглушение/включение,
    // иначе звук не начнёт звучать до ручного включения микрофона.
    if (isSafari) {
      // Попытка автоматически обойти "требуется toggle" баг Safari:
      audio.muted = true;
      // Пытаемся запустить — если это упадёт, добавим слушатель жеста.
      audio.play().catch(()=>{ ensureResumeOnUserGesture(); });
      // через небольшой таймаут снимаем mute — иногда этого достаточно.
      setTimeout(()=> {
        try { audio.muted = false; audio.play().catch(()=>{}); } catch(e){}
      }, 120);
      return {
        element: audio,
        node: null,
        setVolume(v){ try{ audio.volume = Math.max(0, Math.min(1, v)); }catch(e){} },
        destroy(){ try{ audio.pause(); audio.srcObject = null; audio.remove(); }catch(e){} }
      };
    }

    // Для остальных браузеров используем WebAudio (если доступен)
    if (window._voiceCompat.audioContext) {
      try {
        const ctx = window._voiceCompat.audioContext;

        // Создаём MediaStreamSource из потока и узел усиления для управления громкостью
        const src = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        gain.gain.value = (typeof opts.initialVolume === 'number') ? opts.initialVolume : 1.0;

        // Подключаем источник -> усиление -> выход
        src.connect(gain);
        gain.connect(ctx.destination);

        // Для предотвращения "двойного" воспроизведения в браузерах, где
        // и AudioContext, и <audio> воспроизводят один поток, оставим <audio> приглушённым.
        audio.muted = true;
        // И всё равно попробуем воспроизвести элемент — на случай, если AudioContext не даёт звука.
        audio.play().catch(()=>{ /* ignore */ });

        // Если play() упал из-за политики autoplay — добавим слушатель, который снимет блокировку
        audio.addEventListener('play', ()=> {
          // при первом успешном play — убедимся, что контекст в состоянии running
          if (ctx.state === 'suspended') ctx.resume().catch(()=>{});
        });

        // В случае падения play (отловим через Promise)
        audio.play && audio.play().catch(()=>{ ensureResumeOnUserGesture(); });

        return {
          element: audio,
          node: gain,
          setVolume(v){ try{ gain.gain.value = Math.max(0, Math.min(1, v)); }catch(e){} },
          destroy(){ try{ src.disconnect(); gain.disconnect(); audio.pause(); audio.srcObject = null; audio.remove(); }catch(e){} }
        };

      } catch (e) {
        console.warn('Ошибка при подключении к WebAudio, fallback к audio element', e);
        // fallback: оставить только audio element unmuted
        audio.muted = false;
        audio.play().catch(()=>{ ensureResumeOnUserGesture(); });
        return {
          element: audio,
          node: null,
          setVolume(v){ try{ audio.volume = Math.max(0, Math.min(1, v)); }catch(e){} },
          destroy(){ try{ audio.pause(); audio.srcObject = null; audio.remove(); }catch(e){} }
        };
      }
    } else {
      // Если WebAudio недоступен, используем только <audio>
      audio.muted = false;
      audio.play().catch(()=>{ ensureResumeOnUserGesture(); });
      return {
        element: audio,
        node: null,
        setVolume(v){ try{ audio.volume = Math.max(0, Math.min(1, v)); }catch(e){} },
        destroy(){ try{ audio.pause(); audio.srcObject = null; audio.remove(); }catch(e){} }
      };
    }
  };

  // Утилита: попытаться восстановить все ранее созданные элементы (может помочь при рестарте страницы)
  window._voiceCompat.resumeAll = function(){
    resumeAudioContextAndElements();
  };

  // Автоматически вызываем resume при загрузке (без гарантии)
  try { resumeAudioContextAndElements(); } catch(e){}

  // Переэкспорт функции в глобальный объект приложения, если он есть
  try {
    if (window.App && !window.App.attachRemoteStream) {
      window.App = window.App || {};
      window.App.attachRemoteStream = window._voiceCompat.attachRemoteStream;
    }
  } catch(e){}
})();
