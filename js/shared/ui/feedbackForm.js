// Moved verbatim from js/utils.js in refactor chunk 1A. Loaded as an ES module through
// js/shared/globals.js, which assigns its exports to the same window.* names utils.js set.
// Comments below that say "this file" or "utils.js" were written when this was one file.

function injectFeedbackForm() {
    const container = document.getElementById('shared-feedback-container');
    if (!container) return;

    container.innerHTML = `
        <div style="padding: 1rem 1.5rem; border-top: 1px solid var(--border); margin-top: 1rem;">
            <h4 style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.75rem;">Report a Bug / Feedback</h4>
            <form action="https://formspree.io/f/xaewqqkq" method="POST" style="display: flex; flex-direction: column; gap: 0.5rem;">
                <input type="email" name="email" class="form-input" placeholder="Your email (optional)" aria-label="Your email (optional)" autocomplete="email" style="padding: 0.5rem; font-size: 0.85rem;">
                <textarea name="message" class="form-input" placeholder="What went wrong?" aria-label="What went wrong?" required style="padding: 0.5rem; font-size: 0.85rem; min-height: 80px; resize: vertical;"></textarea>
                <button type="submit" class="btn btn-primary btn-sm">Submit</button>
            </form>
        </div>
    `;
}

// Automatically run this when the page loads

document.addEventListener('DOMContentLoaded', injectFeedbackForm);
