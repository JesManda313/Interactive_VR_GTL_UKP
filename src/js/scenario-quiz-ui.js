// scenario-quiz-ui.js: UI kuis popup HTML flat + status visual opsi.
// Aksi dikirim lewat callback agar tidak circular import dengan scenario.js.

// renderMobileQuizPopup(): bangun popup kuis HTML flat; escape "<" cegah injeksi.
export function renderMobileQuizPopup(scenario, onSelect) {
  const popup = document.getElementById('mobileQuizPopup');
  const questionEl = document.getElementById('mobileQuizQuestion');
  const optionsEl = document.getElementById('mobileQuizOptions');
  const feedbackEl = document.getElementById('mobileQuizFeedback');
  if (!popup || !questionEl || !optionsEl) return;

  document.getElementById('mobileEndPopup')?.classList.add('hidden');
  questionEl.textContent = scenario.question ?? '-';
  if (feedbackEl) {
    feedbackEl.textContent = 'Pilih salah satu jawaban.';
    feedbackEl.className = 'mobile-quiz-feedback';
  }

  optionsEl.innerHTML = (scenario.options ?? [])
    .map((option, index) => {
      const label = String(option.label ?? String.fromCharCode(65 + index)).replace(/</g, '&lt;');
      const text = String(option.text ?? '').replace(/</g, '&lt;');
      return `
        <button
          type="button"
          class="mobile-quiz-option"
          data-option-index="${index}"
          data-next="${String(option.next ?? '')}"
          data-consequence="${String(option.consequence ?? '')}"
          data-correct="${option.correct ? 'true' : 'false'}"
        ><span class="opt-label">${label}</span><span>${text}</span></button>
      `;
    })
    .join('');

  optionsEl.querySelectorAll('.mobile-quiz-option').forEach((button) => {
    button.addEventListener('click', (event) => {
      onSelect?.(event, button);
    });
  });

  popup.classList.remove('hidden');
}

// resetOptionStates(): netralkan status visual semua opsi 3D + HTML.
export function resetOptionStates() {
  document.querySelectorAll('.quiz-option').forEach((option) => {
    option.dataset.selected = '';

    const bg = option.querySelector('.option-bg');

    if (bg) {
      bg.setAttribute('color', '#6f9fbd');
    }
  });

  document.querySelectorAll('.mobile-quiz-option').forEach((option) => {
    option.classList.remove('correct', 'wrong');
    option.disabled = false;
  });
}

// setFeedback(): tulis pesan umpan balik ke teks 3D + popup HTML mobile.
export function setFeedback(message, color = '#fef08a') {
  document.querySelectorAll('.feedback-text').forEach((text) => {
    text.setAttribute('value', message);
    text.setAttribute('color', color);
  });

  const mobileFeedback = document.getElementById('mobileQuizFeedback');
  if (mobileFeedback && !document.getElementById('mobileQuizPopup')?.classList.contains('hidden')) {
    mobileFeedback.textContent = message;
    mobileFeedback.className = `mobile-quiz-feedback${color === '#bbf7d0' ? ' good' : color === '#fecaca' ? ' bad' : ''}`;
  }
}

// colorSelectedOptions(): warnai opsi terpilih (hijau/merah) lalu kunci opsi HTML.
export function colorSelectedOptions(index, correct) {
  document.querySelectorAll(`.quiz-option[data-option-index="${index}"]`).forEach((option) => {
    option.dataset.selected = 'true';

    const bg = option.querySelector('.option-bg');

    if (bg) {
      bg.setAttribute('color', correct ? '#16a34a' : '#dc2626');
    }
  });

  document.querySelectorAll(`.mobile-quiz-option[data-option-index="${index}"]`).forEach((option) => {
    option.classList.add(correct ? 'correct' : 'wrong');
  });
  // Kunci opsi HTML agar tidak bisa tap dobel saat transisi.
  document.querySelectorAll('.mobile-quiz-option').forEach((option) => {
    option.disabled = true;
  });
}
