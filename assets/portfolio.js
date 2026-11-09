(() => {
  const architectureFrames = [...document.querySelectorAll('.arch-preview iframe, #archModalFrame')];
  // Include inline architecture frames independently of presentation class names.
  document.querySelectorAll('iframe[src*="_architecture.html"]').forEach(frame => {
    if (!architectureFrames.includes(frame)) architectureFrames.push(frame);
  });
  function sendArchitectureTheme(frame) {
    frame.contentWindow?.postMessage({type: 'portfolio-theme', theme: document.documentElement.dataset.theme}, location.protocol === 'file:' ? '*' : location.origin);
  }
  architectureFrames.forEach(frame => frame.addEventListener('load', () => sendArchitectureTheme(frame)));
  addEventListener('message', event => {
    if (event.data?.type !== 'architecture-theme-request') return;
    const frame = architectureFrames.find(frame => frame.contentWindow === event.source);
    if (frame) sendArchitectureTheme(frame);
  });
  new MutationObserver(() => architectureFrames.forEach(sendArchitectureTheme)).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});
  architectureFrames.forEach(sendArchitectureTheme);

  const composer = document.getElementById('contactComposer');
  if (composer) {
    const email = document.getElementById('contactEmail').textContent.trim();
    const subject = document.getElementById('contactSubject');
    const message = document.getElementById('contactMessage');
    const mailto = document.getElementById('contactMailto');
    const status = document.getElementById('contactStatus');
    const topics = {
      role: { subject: 'ML / AI engineering opportunity', body: "Hi Haseeb,\n\nI'd like to discuss an ML / AI engineering opportunity.\n\nRole and team:\nWhat we're building:\nRole or company link:\n\nBest,\n" },
      engineering: { subject: 'Let’s discuss a production ML system', body: "Hi Haseeb,\n\nI'd like to discuss a system or technical question.\n\nThe problem:\nCurrent approach:\nWhat I'd like to explore:\n\nBest,\n" },
      research: { subject: 'Research collaboration — LLM evaluation', body: "Hi Haseeb,\n\nI'd like to explore a research collaboration.\n\nResearch question:\nRelevant paper or project:\nPossible collaboration:\n\nBest,\n" }
    };
    let selected = 'role';
    const drafts = new Map(Object.entries(topics).map(([key, value]) => [key, value.body]));
    function syncEmailDraft() {
      subject.textContent = topics[selected].subject;
      mailto.href = `mailto:${email}?subject=${encodeURIComponent(topics[selected].subject)}&body=${encodeURIComponent(message.value)}`;
    }
    composer.querySelectorAll('[name="contact-topic"]').forEach(radio => radio.addEventListener('change', () => {
      if (!radio.checked) return;
      drafts.set(selected, message.value);
      selected = radio.value;
      message.value = drafts.get(selected);
      status.textContent = '';
      syncEmailDraft();
    }));
    message.addEventListener('input', () => { drafts.set(selected, message.value); syncEmailDraft(); });
    message.value = drafts.get(selected);
    syncEmailDraft();
    composer.hidden = false;
    const copyEmail = document.getElementById('copyEmail');
    copyEmail.hidden = false;
    const timers = new Map();
    async function copyContactText(button, text, draft) {
      clearTimeout(timers.get(button));
      const label = button.querySelector('span');
      const idle = draft ? 'Copy draft' : 'Copy address';
      button.disabled = true;
      label.textContent = 'Copying…';
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
        label.textContent = 'Copied';
        status.textContent = draft ? 'Draft copied. Paste it into your preferred email app.' : 'Email address copied.';
        timers.set(button, setTimeout(() => { label.textContent = idle; }, 2200));
      } catch {
        label.textContent = idle;
        if (draft) {
          message.focus();
          message.select();
          status.textContent = 'Copy is unavailable here. Your message is selected; use your device’s copy command.';
        } else {
          const range = document.createRange();
          range.selectNodeContents(document.getElementById('contactEmail'));
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          status.textContent = 'Copy is unavailable here. The address is selected; use your device’s copy command.';
        }
      } finally { button.disabled = false; }
    }
    copyEmail.addEventListener('click', () => copyContactText(copyEmail, email, false));
    document.getElementById('copyDraft').addEventListener('click', event => copyContactText(event.currentTarget, `To: ${email}\nSubject: ${topics[selected].subject}\n\n${message.value}`, true));
    const clock = document.getElementById('contactLocalTime');
    function updateContactTime() {
      const now = new Date();
      clock.dateTime = now.toISOString();
      clock.textContent = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'}).format(now);
    }
    updateContactTime();
    setInterval(() => { if (!document.hidden) updateContactTime(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) updateContactTime(); });
  }

  const hero = document.querySelector('.hero');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionControls = [...document.querySelectorAll('[data-motion-control]')];
  const journeySections = [...document.querySelectorAll('[data-journey]')];
  const journeyVisibility = new Map(journeySections.map(section => [section, false]));
  let userPaused = false;
  let heroVisible = false;
  try { userPaused = localStorage.getItem('mh-motion') === 'paused'; } catch {}
  if (!reducedMotion.matches) hero?.classList.add('is-animated');
  function syncBackgroundMotion() {
    const paused = userPaused || reducedMotion.matches || !heroVisible || document.hidden;
    if (hero) hero.dataset.motion = paused ? 'paused' : 'running';
    journeySections.forEach(section => {
      const stopped = userPaused || reducedMotion.matches || !journeyVisibility.get(section) || document.hidden;
      section.dataset.motion = stopped ? 'paused' : 'running';
    });
    motionControls.forEach(control => {
      const pageControl = control.dataset.motionContext === 'page';
      control.disabled = reducedMotion.matches;
      control.setAttribute('aria-pressed', String(!userPaused && !reducedMotion.matches));
      control.setAttribute('aria-label', `${userPaused ? 'Play' : 'Pause'} ${pageControl ? 'page ' : ''}background animation`);
      control.querySelector('path').setAttribute('d', userPaused ? 'M8 5v14l11-7z' : 'M9 5v14M15 5v14');
      control.querySelector('span').textContent = reducedMotion.matches ? 'Motion reduced' : pageControl ? `${userPaused ? 'Play' : 'Pause'} page motion` : `${userPaused ? 'Play' : 'Pause'} background`;
    });
  }
  motionControls.forEach(control => control.addEventListener('click', () => {
    userPaused = !userPaused;
    try { localStorage.setItem('mh-motion', userPaused ? 'paused' : 'running'); } catch {}
    syncBackgroundMotion();
  }));

  // Native SVG geometry follows the content height, including lazy-loaded photos.
  const journeyGraphics = new Map();
  journeySections.forEach((section, index) => {
    const circuit = document.createElement('div');
    circuit.className = 'journey-circuit';
    circuit.setAttribute('aria-hidden', 'true');
    circuit.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none"><path class="journey-base"/><path class="journey-progress" pathLength="100"/><path class="journey-trace" pathLength="100"/><path class="journey-branch"/><circle class="journey-node" cx="4" r="4"/></svg>';
    circuit.style.setProperty('--journey-delay', `${-index * 1.5}s`);
    section.prepend(circuit);
    journeyGraphics.set(section, circuit);
  });
  function sizeJourney() {
    journeySections.forEach(section => {
      const circuit = journeyGraphics.get(section);
      const box = section.getBoundingClientRect();
      const heading = section.querySelector('.sec-title, .footer-title');
      const headingBox = heading.getBoundingClientRect();
      const nodeY = headingBox.top - box.top + headingBox.height / 2;
      const height = Math.max(1, box.height);
      circuit.querySelector('svg').setAttribute('viewBox', `0 0 24 ${height}`);
      circuit.querySelector('.journey-base').setAttribute('d', `M4 0V${height}`);
      circuit.querySelector('.journey-trace').setAttribute('d', `M4 0V${height}`);
      circuit.querySelector('.journey-progress').setAttribute('d', `M4 0V${height}`);
      circuit.querySelector('.journey-branch').setAttribute('d', `M4 ${nodeY}H12`);
      circuit.querySelector('.journey-node').setAttribute('cy', nodeY);
    });
    syncJourneyProgress();
  }
  function syncJourneyProgress() {
    // The reading position sits near the viewport centre; the page end completes it.
    const readingLine = innerHeight * .55;
    const atEnd = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
    journeySections.forEach(section => {
      const box = section.getBoundingClientRect();
      const progress = atEnd ? 1 : Math.max(0, Math.min(1, (readingLine - box.top) / Math.max(1, box.height)));
      const circuit = journeyGraphics.get(section);
      circuit.querySelector('.journey-progress').style.strokeDashoffset = String(100 * (1 - progress));
      const nodeY = Number(circuit.querySelector('.journey-node').getAttribute('cy'));
      section.classList.toggle('journey-reached', progress > 0 && progress * box.height >= nodeY);
    });
  }
  const journeyResize = new ResizeObserver(sizeJourney);
  const journeyObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => journeyVisibility.set(entry.target, entry.isIntersecting));
    syncBackgroundMotion();
  });
  journeySections.forEach(section => { journeyResize.observe(section); journeyObserver.observe(section); });
  document.fonts?.ready.then(sizeJourney);
  sizeJourney();
  if (hero) new IntersectionObserver(entries => {
    heroVisible = entries[0].isIntersecting;
    syncBackgroundMotion();
  }).observe(hero);
  document.addEventListener('visibilitychange', syncBackgroundMotion);
  reducedMotion.addEventListener('change', event => {
    hero?.classList.toggle('is-animated', !event.matches);
    syncBackgroundMotion();
  });
  syncBackgroundMotion();

  // The long portfolio needs a stable location cue, not repeated entrance effects.
  const links = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const sections = links.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  let queued = false;
  function syncLocation() {
    const threshold = document.querySelector('.site-nav').getBoundingClientRect().height + 100;
    const atBottom = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
    const current = atBottom ? sections.at(-1) : sections.filter(section => section.getBoundingClientRect().top <= threshold).at(-1);
    links.forEach(link => {
      if (current && link.getAttribute('href') === `#${current.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    syncJourneyProgress();
    queued = false;
  }
  window.addEventListener('scroll', () => {
    if (!queued) { queued = true; requestAnimationFrame(syncLocation); }
  }, { passive: true });
  window.addEventListener('resize', syncLocation);
  syncLocation();
})();
