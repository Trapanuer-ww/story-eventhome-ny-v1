(function () {
  "use strict";

  /* ==========================================================================
     Analytics abstraction
     ------------------------------------------------------------------------
     TODO(integration): подключить реальный счётчик Яндекс.Метрики / GA4.
     Сейчас события пишутся в window.dataLayer (совместимо с GTM) и в консоль
     для дебага. Если в проекте уже есть своя аналитика — заменить track()
     на вызов существующей функции, сохранив те же имена событий.
     Требуемые события по брифу:
     viewing_open, format_cta_click, form_open, form_submit,
     phone_click, section_view.
     ========================================================================== */
  window.dataLayer = window.dataLayer || [];

  function track(eventName, params) {
    var payload = Object.assign({ event: eventName, ts: Date.now() }, params || {});
    window.dataLayer.push(payload);
    if (window.location.search.indexOf("debug=1") !== -1) {
      console.log("[track]", eventName, payload);
    }
    // Пример точки интеграции с Яндекс.Метрикой (счётчик пока не подключён):
    // if (window.ym) { window.ym(COUNTER_ID, "reachGoal", eventName, params); }
  }

  /* ---------------------------------------------------------------------- */
  /* Formats: шкалы вместимости заполняются при появлении блока             */
  /* ---------------------------------------------------------------------- */
  (function formatScales() {
    var grid = document.querySelector(".fmt-grid");
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!grid || reduce || !("IntersectionObserver" in window)) return;
    grid.classList.add("fmt-anim");
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { grid.classList.add("fmt-in"); io.disconnect(); }
    }, { threshold: 0.3 });
    io.observe(grid);
  })();

  /* ---------------------------------------------------------------------- */
  /* Header scroll state                                                    */
  /* ---------------------------------------------------------------------- */
  var header = document.getElementById("siteHeader");
  var lastScrollY = window.scrollY;

  function onScroll() {
    var y = window.scrollY;
    header.classList.toggle("is-scrolled", y > 40);

    var sticky = document.getElementById("stickyCta");
    if (sticky) {
      var scrolledUp = y < lastScrollY;
      var nearBottom = y + window.innerHeight >= document.body.scrollHeight - 40;
      sticky.classList.toggle("is-hidden", nearBottom);
    }
    lastScrollY = y;
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------------------------------------------------------------------- */
  /* Nav link tracking                                                      */
  /* ---------------------------------------------------------------------- */
  document.querySelectorAll("[data-track-nav]").forEach(function (el) {
    el.addEventListener("click", function () {
      track("nav_click", { section: el.getAttribute("data-track-nav") });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Generic click tracking (phone, CTA labels via data-track)              */
  /* ---------------------------------------------------------------------- */
  document.querySelectorAll("[data-track]").forEach(function (el) {
    el.addEventListener("click", function () {
      track(el.getAttribute("data-track"), { place: el.getAttribute("data-track-place") || null });
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Section view tracking (IntersectionObserver)                          */
  /* ---------------------------------------------------------------------- */
  var seenSections = {};
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var name = entry.target.getAttribute("data-section");
        if (entry.isIntersecting && !seenSections[name]) {
          seenSections[name] = true;
          track("section_view", { section: name });
        }
      });
    }, { threshold: 0.35 });
    document.querySelectorAll("[data-section]").forEach(function (el) { io.observe(el); });
  }

  /* ---------------------------------------------------------------------- */
  /* Hero headline A/B (H-55): ?hook=lit переключает на литературный вариант*/
  /* по умолчанию — умеренный вариант (см. strategy_ny_corporate, Риск 1)   */
  /* ---------------------------------------------------------------------- */
  (function heroHookVariant() {
    var params = new URLSearchParams(window.location.search);
    var variant = params.get("hook") === "lit" ? "literary" : "moderate";
    var titleEl = document.getElementById("heroTitle");
    if (titleEl) {
      var text = variant === "literary"
        ? titleEl.getAttribute("data-hook-literary")
        : titleEl.getAttribute("data-hook-moderate");
      if (text) titleEl.textContent = text;
    }
    track("hero_variant_shown", { variant: variant });
  })();

  /* ---------------------------------------------------------------------- */
  /* Hero intro: "Story" появляется по буквам (bottom-up, стаггер 88мс),    */
  /* затем кроссфейдом сменяется на реальный контент hero.                 */
  /* Уважает prefers-reduced-motion отдельной синхронной веткой (без       */
  /* лишней паузы), не трогает #heroTitle (см. heroHookVariant выше).      */
  /* ---------------------------------------------------------------------- */
  (function heroIntro() {
    var HOLD_MS = 300;
    var SAFETY_TIMEOUT_MS = 3000;
    var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

    var heroInner = document.querySelector(".hero-inner");
    var introEl = document.getElementById("heroIntro");
    var wordEl = document.getElementById("heroIntroWord");
    var revealed = false;

    function reveal() {
      if (revealed) return;
      revealed = true;
      if (heroInner) {
        heroInner.classList.add("is-revealed");
        heroInner.removeAttribute("aria-hidden");
        heroInner.querySelectorAll("[data-intro-tabindex]").forEach(function (el) {
          el.removeAttribute("tabindex");
          el.removeAttribute("data-intro-tabindex");
        });
      }
      if (introEl) {
        introEl.classList.add("is-hidden");
        introEl.addEventListener("transitionend", function onEnd(e) {
          if (e.target === introEl) {
            introEl.style.display = "none";
            introEl.removeEventListener("transitionend", onEnd);
          }
        });
      }
      track("hero_intro_complete", { reduced_motion: reduceMotion });
    }

    window.setTimeout(reveal, SAFETY_TIMEOUT_MS); // подстраховка: контент не может остаться скрытым навсегда

    if (!heroInner) { reveal(); return; }

    heroInner.setAttribute("aria-hidden", "true");
    heroInner.querySelectorAll("button, a, input").forEach(function (el) {
      el.setAttribute("tabindex", "-1");
      el.setAttribute("data-intro-tabindex", "1");
    });

    if (reduceMotion || !introEl || !wordEl) {
      reveal(); // мгновенно, без движения, без таймеров
      return;
    }

    var chars = Array.from(wordEl.textContent);
    wordEl.innerHTML = "";
    var lastLetter = null;
    chars.forEach(function (ch, i) {
      var span = document.createElement("span");
      span.className = "letter";
      span.style.setProperty("--i", i);
      span.textContent = ch;
      wordEl.appendChild(span);
      lastLetter = span;
    });

    if (!lastLetter) { reveal(); return; }

    lastLetter.addEventListener("animationend", function onLastLetter(e) {
      if (e.animationName !== "heroIntroLetterUp") return;
      lastLetter.removeEventListener("animationend", onLastLetter);
      window.setTimeout(reveal, HOLD_MS);
    });
  })();

  /* ---------------------------------------------------------------------- */
  /* Hero video: pause when not visible to save battery/CPU on mobile       */
  /* ---------------------------------------------------------------------- */
  var heroVideo = document.getElementById("heroVideo");
  if (heroVideo && "IntersectionObserver" in window) {
    var videoIo = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          heroVideo.play().catch(function () { /* автоплей может быть заблокирован — остаётся poster */ });
        } else {
          heroVideo.pause();
        }
      });
    }, { threshold: 0.1 });
    videoIo.observe(heroVideo);
  }

  /* ---------------------------------------------------------------------- */
  /* Form modal: CRM-форма Битрикс24 №7 (та же, что на storyevent.ru).      */
  /* Заявка уходит прямо в CRM. Кнопка задаёт заголовок модалки и           */
  /* подставляет формат в поле «Тип мероприятия» — его можно исправить.     */
  /* ---------------------------------------------------------------------- */
  var B24_FIELD_TYPE = "DEAL_UF_CRM_1779793213603"; // «Тип мероприятия» в форме №7
  var FORM_PRESETS = {
    viewing: {
      title: "Запись на просмотр",
      sub: "Оставьте имя и телефон — согласуем удобное время, чтобы показать особняк.",
      type: "Новогодний корпоратив, просмотр"
    },
    banquet: {
      title: "Банкет, до 100 гостей",
      sub: "Оставьте контакты — проверим свободные даты в декабре и подготовим расчёт.",
      type: "Корпоратив, банкет до 100 гостей"
    },
    vip: {
      title: "Банкет VIP, до 70 гостей",
      sub: "Оставьте контакты — проверим свободные даты в декабре и подготовим расчёт.",
      type: "Корпоратив, банкет VIP до 70 гостей"
    },
    buffet: {
      title: "Фуршет, до 200 гостей",
      sub: "Оставьте контакты — проверим свободные даты в декабре и подготовим расчёт.",
      type: "Корпоратив, фуршет до 200 гостей"
    },
    unsure: {
      title: "Обсудить вечер",
      sub: "Расскажите о команде — подберём формат, рассадку и меню под число гостей.",
      type: "Новогодний корпоратив"
    }
  };

  var overlay = document.getElementById("formOverlay");
  var closeBtn = document.getElementById("formClose");
  var titleEl = document.getElementById("formTitle");
  var subEl = document.getElementById("formSub");
  var b24Form = null;        // экземпляр формы, появляется после загрузки скрипта Битрикса
  var pendingType = null;    // тип, выбранный до загрузки формы
  var lastPlace = null;
  var lastFocusedEl = null;
  var justOpenedUntil = 0;

  // Форма могла инициализироваться раньше этого скрипта — тогда берём её из реестра Битрикса
  function findB24Form() {
    if (b24Form) return b24Form;
    try {
      var list = window.b24form && window.b24form.App && window.b24form.App.list ? window.b24form.App.list() : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].identification && String(list[i].identification.id) === "7") { b24Form = list[i]; break; }
      }
    } catch (e) { /* реестр недоступен — дождёмся события b24:form:init */ }
    return b24Form;
  }

  function applyType(value) {
    if (!value) return;
    findB24Form();
    if (b24Form && typeof b24Form.setValues === "function") {
      var values = {};
      values[B24_FIELD_TYPE] = value;
      try { b24Form.setValues(values); } catch (e) { /* форма не приняла значение — поле останется пустым */ }
    } else {
      pendingType = value;
    }
  }

  window.addEventListener("b24:form:init", function (e) {
    if (!e.detail || !e.detail.object) return;
    b24Form = e.detail.object;
    if (pendingType) { applyType(pendingType); pendingType = null; }
  });

  window.addEventListener("b24:form:send:success", function () {
    track("form_submit", { form: "b24-crm-7", place: lastPlace });
  });

  function openForm(btn) {
    var preset = FORM_PRESETS[btn.getAttribute("data-form-preset")] || FORM_PRESETS.viewing;
    lastPlace = btn.getAttribute("data-track-place");
    titleEl.textContent = preset.title;
    subEl.textContent = preset.sub;
    applyType(preset.type);

    lastFocusedEl = document.activeElement;
    overlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
    justOpenedUntil = Date.now() + 400; // защита от случайного клика по фону во время анимации открытия
    track("form_open", { place: lastPlace });
    window.setTimeout(function () {
      var firstInput = overlay.querySelector(".story-b24 input");
      if (firstInput) firstInput.focus();
    }, 350);
  }

  function closeForm() {
    overlay.classList.remove("is-open");
    document.body.style.overflow = "";
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  document.querySelectorAll("[data-open-form]").forEach(function (btn) {
    btn.addEventListener("click", function () { openForm(btn); });
  });
  closeBtn.addEventListener("click", closeForm);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay && Date.now() > justOpenedUntil) closeForm();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && overlay.classList.contains("is-open")) closeForm();
  });

})();
