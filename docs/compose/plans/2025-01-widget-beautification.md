# Widget Beautification & Size Adjustment

> **For agentic workers:** REQUIRED SUB-SKILL: Use compose:subagent (recommended) or compose:execute to implement this plan task-by-task.

**Goal:** Beautify the desktop widget with a refined glass-morphism style aligned to the main app's design language, and increase initial dimensions to 420x620.

**Architecture:** Modify two files: `tauri.conf.json` for window size, `widget.html` for all CSS/HTML styling. The widget.js remains untouched — only visual changes.

**Tech Stack:** Tauri v2, vanilla HTML/CSS/JS, HTML5 Canvas

## Global Constraints

- Widget must remain CSP-compliant (no inline scripts)
- All CSS variables must use hardcoded values (widget doesn't share main app's CSS variable scope)
- Widget background must stay transparent for Tauri's transparent window
- Keep all existing functionality intact (data fetching, SPC chart, interactions)

---

### Task 1: Increase Widget Window Size

**Files:**
- Modify: `launcher/tauri.conf.json:39-40`

- [ ] **Step 1: Update widget dimensions**

Change width from 320 to 420, height from 480 to 620:

```json
"width": 420,
"height": 620,
```

---

### Task 2: Beautify Widget CSS & HTML

**Files:**
- Modify: `frontend/public/widget.html` (full CSS rewrite + HTML structure updates)

- [ ] **Step 1: Rewrite CSS with refined glass-morphism design**

Replace the entire `<style>` block with the new design system including:
- CSS custom properties matching main app's color palette
- Multi-layer glass effect on body and cards
- Gradient top accent bars on summary cards (cyan, green, orange, purple, blue)
- Card hover glow + translateY animation
- DIN Alternate / monospace font for numeric values (24px)
- Header with gradient bottom border
- Status dots with breathing animation for "collecting" state
- Alert items with severity badges
- SPC canvas height increased to 150px
- Entry animations (fadeIn with staggered delays)
- Settings panel matching the refined style

- [ ] **Step 2: Update HTML structure for enhanced cards**

Add icon spans to summary cards, adjust status card markup for icon support.

- [ ] **Step 3: Update SPC canvas height**

Change canvas height attribute from 110 to 150.

- [ ] **Step 4: Update widget.js SPC chart height constant**

In `widget.js`, update the chart height from 110 to 150 to match the new canvas size.

---

### Task 3: Verify

- [ ] **Step 1: Build and test**

Run `npm run build` in the frontend directory to verify no build errors. Visually verify the widget renders correctly in the Tauri dev environment.
