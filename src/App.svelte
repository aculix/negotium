<script>
  import { onMount, tick, flushSync } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import './style.css';

  import { toKey, addDays, fromKey, formatLong } from './lib/dates.js';
  import { createStorage } from './lib/storage.js';
  import { rollover, msUntilNextMidnight } from './lib/rollover.js';
  import * as taskOps from './lib/tasks.js';
  import { createUndoStack, applyUndo } from './lib/undo.js';
  import { shouldHandleUndo } from './lib/shortcuts.js';
  import { buildExport, serialize, parseImport, mergeImport } from './lib/backup.js';
  import { moveTaskToDay } from './lib/defer.js';

  const storage = createStorage();
  const undoStack = createUndoStack();

  // Storage is synchronous, so the first render can already have the real list.
  // Loading in onMount instead meant one frame of the empty state on every
  // launch. That was hidden behind the splash screen before, and very visible once
  // that went away.
  storage.migrateLegacyKeys();
  const bootNow = new Date();

  const bootTodayKey = toKey(bootNow);
  const beforeRollover = storage.loadTasks(bootTodayKey).length;

  let tasks = $state(rollover(storage, bootNow));

  /** How many unfinished tasks were pulled forward from earlier days on this
   *  load. The app's cleverest behaviour used to happen in complete silence,
   *  so returning after a weekend looked like a bug rather than a feature. */
  let carriedOver = $state(Math.max(0, tasks.length - beforeRollover));

  function dismissCarriedOver() {
    carriedOver = 0;
  }
  let newTask = $state('');
  // Seeded from the class the pre-paint script in index.html already set, so
  // there is one source of truth and no post-mount correction to flash.
  let darkMode = $state(document.documentElement.classList.contains('dark'));
  let isInitialized = false;
  let todayKey = $state(toKey(bootNow));
  let selectedKey = $state(toKey(bootNow));
  let draggedId = $state(null);
  let settlingId = $state(null);
  let dragOffsetY = $state(0);
  let settleTimer = null;
  let midnightTimer = null;

  /** Single write path, so persistence cannot drift out of step with the list.
   *  Loading a different day assigns `tasks` directly and deliberately skips
   *  this, because there is nothing new to save. */
  function setTasks(next) {
    tasks = next;
    if (isInitialized) storage.saveTasks(selectedKey, tasks);
  }

  function addTask() {
    const next = taskOps.addTask(tasks, newTask);
    if (next === tasks) return;
    setTasks(next);
    newTask = '';
  }

  function toggleTask(id) {
    setTasks(taskOps.toggleTask(tasks, id));
  }

  function deleteTask(id) {
    const index = tasks.findIndex(task => task.id === id);
    if (index === -1) return;
    undoStack.push({ type: 'delete', task: tasks[index], index });
    setTasks(taskOps.deleteTask(tasks, id));
    showUndo('Task deleted');
  }

  function clearCompleted() {
    // Built in ascending index order, which applyUndo relies on to put each
    // task back where it was.
    const removed = tasks
      .map((task, index) => ({ task, index }))
      .filter(({ task }) => task.completed);

    if (removed.length === 0) return;
    undoStack.push({ type: 'clearCompleted', removed });
    setTasks(taskOps.clearCompleted(tasks));
    showUndo(removed.length === 1 ? '1 completed task cleared' : `${removed.length} completed tasks cleared`);
  }

  const viewingToday = $derived(selectedKey === todayKey);

  let editingId = $state(null);
  let editingText = $state('');
  // A drag ends with a click event, which would otherwise drop the row you
  // just moved straight into edit mode.
  let suppressClick = false;

  function startEditing(task) {
    if (suppressClick || draggedId) return;
    editingId = task.id;
    editingText = task.text;
  }

  function commitEdit() {
    if (editingId === null) return;
    // renameTask refuses blank input, so an accidental select-all and enter
    // leaves the task as it was rather than wiping it.
    setTasks(taskOps.renameTask(tasks, editingId, editingText));
    editingId = null;
  }

  function cancelEdit() {
    editingId = null;
  }

  function handleEditKeydown(event) {
    // Stop these reaching the row, which would delete or reorder the task
    // being typed into.
    event.stopPropagation();

    if (event.key === 'Enter') {
      event.preventDefault();
      commitEdit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit();
    }
  }

  function focusOnMount(node) {
    node.focus();
    node.select();
  }

  /** "Not today, tomorrow" and its reverse. Which direction depends only on
   *  which day you are looking at, so one control covers both. */
  function deferTask(taskId) {
    cancelEdit();
    const destination = viewingToday ? tomorrowKey() : todayKey;
    tasks = moveTaskToDay(storage, selectedKey, destination, taskId);
  }

  /**
   * Undo used to be reachable only by Cmd/Ctrl+Z, which nothing announced and
   * which does not exist on a phone at all. This is the one moment it is worth
   * saying something: right after work disappears. It carries the shortcut too,
   * so a keyboard user learns it once, here, rather than from a README.
   */
  let undoNotice = $state(null);
  let undoNoticeTimer = null;

  const UNDO_NOTICE_MS = 7000;
  const shortcutLabel = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? '\u2318Z'
    : 'Ctrl+Z';

  function showUndo(message) {
    undoNotice = message;
    clearTimeout(undoNoticeTimer);
    undoNoticeTimer = setTimeout(() => { undoNotice = null; }, UNDO_NOTICE_MS);
  }

  function dismissUndo() {
    clearTimeout(undoNoticeTimer);
    undoNotice = null;
  }

  function undo() {
    const entry = undoStack.pop();
    if (entry) setTasks(applyUndo(tasks, entry));
    dismissUndo();
  }

  function toggleTheme() {
    darkMode = !darkMode;
  }

  // Svelte's transitions are driven in JavaScript, so the CSS media query in
  // style.css cannot reach them. Read the same preference here and collapse the
  // durations. The lift on a dragged card stays: it tracks the pointer rather
  // than playing at you, and losing it would make dragging harder to follow.
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduceMotion = $state(motionQuery.matches);

  const flyIn = (index) =>
    reduceMotion ? { duration: 0 } : { y: -10, duration: 300, delay: index * 30, easing: cubicOut };

  const flyOut = (index) =>
    reduceMotion ? { duration: 0 } : { x: 30, opacity: 0, duration: 250, delay: index * 20, easing: cubicOut };

  let fileInput;
  let status = $state('');
  let statusIsError = $state(false);
  let statusTimer = null;

  function showStatus(message, isError = false) {
    status = message;
    statusIsError = isError;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status = ''; }, STATUS_MS);
  }

  function exportTasks() {
    const text = serialize(buildExport(storage));
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));

    const link = document.createElement('a');
    link.href = url;
    link.download = `negotium-${todayKey}.json`;
    link.click();
    URL.revokeObjectURL(url);

    showStatus('Exported.');
  }

  async function importTasks(event) {
    const file = event.target.files?.[0];
    // Reset first, so picking the same file twice still fires a change event.
    event.target.value = '';
    if (!file) return;

    let parsed;
    try {
      parsed = parseImport(await file.text());
    } catch {
      showStatus("That file couldn't be read.", true);
      return;
    }

    if (!parsed.ok) {
      showStatus(parsed.error, true);
      return;
    }

    const { imported, duplicates, days } = mergeImport(storage, parsed);
    tasks = storage.loadTasks(selectedKey);

    if (imported === 0) {
      showStatus(duplicates > 0 ? 'Already up to date.' : 'Nothing to import.');
      return;
    }

    const taskWord = imported === 1 ? 'task' : 'tasks';
    const dayWord = days === 1 ? 'day' : 'days';
    showStatus(`Imported ${imported} ${taskWord} across ${days} ${dayWord}.`);
  }

  /** Scoped to the input. Previously this also sat on window, so Enter while a
   *  task was focused would toggle that task *and* add whatever was in the
   *  input. */
  function handleInputKeydown(event) {
    if (event.key === 'Enter') addTask();
    else if (event.key === 'Escape') newTask = '';
  }

  function handleGlobalKeydown(event) {
    if (!shouldHandleUndo(event)) return;
    event.preventDefault();
    undo();
  }

  /** Backspace no longer deletes: it is the key people press meaning "go back",
   *  and a task destroyed that way used to be unrecoverable. Delete still does,
   *  and Cmd/Ctrl+Z now reverses it. */
  function handleTaskKeydown(event, taskId) {
    if (event.key === 'Delete') {
      event.preventDefault();
      deleteTask(taskId);
      return;
    }

    // Reordering must not be pointer-only. The keyed each block moves the
    // existing DOM node, so focus travels with the row.
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      moveTask(taskId, event.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    // Right sends a task forward to Tomorrow, left brings it back. Only the
    // one that makes sense from here does anything.
    if (event.altKey && event.key === 'ArrowRight' && viewingToday) {
      event.preventDefault();
      deferTask(taskId);
    } else if (event.altKey && event.key === 'ArrowLeft' && !viewingToday) {
      event.preventDefault();
      deferTask(taskId);
    }
  }

  // Reordering runs on Pointer Events rather than HTML5 drag-and-drop, which
  // never fired on touch at all, so a documented feature was desktop-only.
  //
  // Touch and mouse need different entry conditions. A mouse drag begins once
  // the pointer has moved past a small threshold. A touch drag cannot, because
  // a vertical swipe on a list is far more likely to mean "scroll"; it begins
  // on a long press instead, and any movement before that cancels the intent
  // and lets the page scroll normally.
  const DRAG_THRESHOLD_PX = 8;
  const LONG_PRESS_MS = 400;
  const SETTLE_MS = 240;
  const STATUS_MS = 4000;

  let drag = null;

  function blockTouchScroll(event) {
    event.preventDefault();
  }

  function beginDrag() {
    if (!drag || drag.active) return;
    drag.active = true;
    draggedId = drag.id;
    dragOffsetY = 0;

    // Layout position of the row, which offsetTop reports free of any
    // transform. It is the fixed reference the pointer offset is measured
    // against, and it stays correct as the row changes slots mid-drag.
    drag.originTop = drag.row.offsetTop;

    // A settling card from a previous drop must not keep its transition, or
    // it would fight the new gesture.
    clearTimeout(settleTimer);
    settlingId = null;

    try {
      drag.row.setPointerCapture(drag.pointerId);
    } catch {
      // Capture is an optimisation; the gesture still works without it.
    }

    if (drag.pointerType !== 'mouse') {
      // touch-action alone cannot stop a gesture already in flight.
      document.addEventListener('touchmove', blockTouchScroll, { passive: false });
    }
  }

  function endDrag() {
    if (!drag) return;

    clearTimeout(drag.timer);
    document.removeEventListener('touchmove', blockTouchScroll);
    try {
      drag.row.releasePointerCapture(drag.pointerId);
    } catch {
      // Already released, or never captured.
    }

    drag = null;
    draggedId = null;
    dragOffsetY = 0;
  }

  /**
   * Inline styling for the one row the pointer is carrying.
   *
   * Only the lifted card is styled here. Everything else is moved by
   * animate:flip, so one mechanism owns `transform` per element. When both
   * did, flip measured a "before" rect that already had a manual offset in
   * it, computed a bogus delta, and slid the whole list on drop.
   *
   * The lifted card takes no transition, so it stays welded to the pointer.
   * On release it keeps its transform but gains one via the settling class,
   * which eases it into its slot instead of snapping.
   */
  function rowStyle(taskId) {
    if (taskId !== draggedId) return '';
    return `transform: translateY(${dragOffsetY}px) scale(1.02) rotate(-0.4deg); transition: none;`;
  }

  function targetIndexFor(clientY) {
    const list = drag.row.parentElement;
    // offsetTop and offsetHeight are layout values, unaffected by the
    // transforms in play, so the target cannot feed back into itself.
    const y = clientY - list.getBoundingClientRect().top;
    const children = [...list.children];

    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (y < child.offsetTop + child.offsetHeight / 2) return i;
    }
    return children.length - 1;
  }

  function handlePointerDown(event, index) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // Let the checkbox and delete button have their clicks.
    if (event.target.closest('button')) return;
    if (event.target.closest('.task-edit')) return;

    drag = {
      id: tasks[index].id,
      originIndex: index,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startY: event.clientY,
      row: event.currentTarget,
      active: false,
      timer: null,
    };

    if (event.pointerType !== 'mouse') {
      drag.timer = setTimeout(beginDrag, LONG_PRESS_MS);
    }
  }

  function handlePointerMove(event) {
    if (!drag) return;

    if (!drag.active) {
      const moved = Math.abs(event.clientY - drag.startY);
      if (drag.pointerType === 'mouse') {
        if (moved > DRAG_THRESHOLD_PX) beginDrag();
      } else if (moved > DRAG_THRESHOLD_PX) {
        // Moved before the long press landed: this is a scroll, not a drag.
        endDrag();
      }
      if (!drag?.active) return;
    }

    // Reorder as the pointer crosses each boundary rather than waiting for the
    // drop. animate:flip then eases the displaced card across, one swap at a
    // time. By release the list is already in its final order, so letting
    // go changes nothing but the lifted card settling into place.
    const from = tasks.findIndex(task => task.id === drag.id);
    const to = targetIndexFor(event.clientY);

    if (from !== -1 && to !== from) {
      tasks = taskOps.reorderTask(tasks, from, to);
      // Apply now, so the row's new offsetTop is readable on the next line.
      flushSync();
    }

    // Measured against layout, so the card stays under the pointer even though
    // the slot beneath it just changed.
    dragOffsetY = (event.clientY - drag.startY) - (drag.row.offsetTop - drag.originTop);
  }

  function handlePointerUp() {
    if (!drag) return;

    const wasActive = drag.active;
    const landedAt = tasks.findIndex(task => task.id === drag.id);
    const settling = drag.id;

    // The order is already correct, applied swap by swap during the
    // drag, so this only writes it through to storage.
    if (wasActive && landedAt !== drag.originIndex) setTasks(tasks);

    endDrag();

    if (!wasActive) return;

    // Swallow the click the browser fires after this drag.
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);

    // Clearing the inline transform while the settling class supplies a
    // transition eases the card into its slot. Nothing else on the list moves,
    // because nothing else changed.
    settlingId = settling;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { settlingId = null; }, SETTLE_MS);
  }

  async function moveTask(taskId, offset) {
    const from = tasks.findIndex(task => task.id === taskId);
    const to = from + offset;
    if (from === -1 || to < 0 || to >= tasks.length) return;

    setTasks(taskOps.reorderTask(tasks, from, to));

    // Reconciling the keyed list drops focus, which would make Alt+Arrow a
    // one-shot: the second press would land on nothing. Put it back on the
    // task that moved so the key can be held down.
    await tick();
    const row = [...document.querySelectorAll('.task-item')]
      .find(el => el.dataset.taskId === String(taskId));
    row?.querySelector('.checkbox')?.focus();
  }

  function tomorrowKey() {
    return toKey(addDays(fromKey(todayKey), 1));
  }

  function showDay(key) {
    if (key === selectedKey) return;
    cancelEdit();
    dismissUndo();
    selectedKey = key;
    tasks = storage.loadTasks(selectedKey);
  }

  /**
   * Re-evaluates the day boundary and reloads the visible list. Safe to call
   * repeatedly, since rollover is idempotent within a day.
   *
   * If the day changed while the user was looking at Today, they stay on the
   * new Today. If they were looking at Tomorrow, that key has become Today and
   * they follow it there, which preserves the existing mental model.
   */
  function runRollover() {
    cancelEdit();
    const now = new Date();
    const wasViewingToday = selectedKey === todayKey;

    todayKey = toKey(now);
    const before = storage.loadTasks(todayKey).length;
    const todayTasks = rollover(storage, now);
    const moved = todayTasks.length - before;
    if (moved > 0) carriedOver = moved;

    if (wasViewingToday) {
      selectedKey = todayKey;
      tasks = todayTasks;
    } else {
      tasks = storage.loadTasks(selectedKey);
    }
  }

  function scheduleMidnight() {
    clearTimeout(midnightTimer);
    midnightTimer = setTimeout(() => {
      runRollover();
      scheduleMidnight();
    }, msUntilNextMidnight(new Date()));
  }

  function handleMotionPreference(event) {
    reduceMotion = event.matches;
  }

  function handleVisibility() {
    if (document.visibilityState === 'visible') runRollover();
  }

  const currentDateDisplay = $derived(formatLong(selectedKey));

  const remainingTasks = $derived(tasks.filter(task => !task.completed).length);
  const completedTasks = $derived(tasks.filter(task => task.completed).length);

  $effect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    if (!isInitialized) return;
    storage.saveTheme(darkMode ? 'dark' : 'light');
  });

  onMount(() => {
    // State is already loaded above; this only opens the write path and lets
    // the theme effect run once without persisting on a plain page load.
    isInitialized = true;

    // Four triggers, because no single one is sufficient. The timer covers a
    // pinned tab crossing midnight unattended; visibility and focus cover
    // machine sleep, where timers do not reliably fire.
    scheduleMidnight();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', runRollover);
    motionQuery.addEventListener('change', handleMotionPreference);

    return () => {
      clearTimeout(midnightTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', runRollover);
      motionQuery.removeEventListener('change', handleMotionPreference);
    };
  });
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="app">
  <header class="header">
    <div class="header-content">
      <div class="logo-section">
        <svg class="logo-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12.37 8.87988H17.62" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6.38 8.87988L7.13 9.62988L9.38 7.37988" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M12.37 15.8799H17.62" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M6.38 15.8799L7.13 16.6299L9.38 14.3799" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9 22H15C20 22 22 20 22 15V9C22 4 20 2 15 2H9C4 2 2 4 2 9V15C2 20 4 22 9 22Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <h1 class="app-title">Negotium</h1>
      </div>
      
      <div class="header-actions">
        <!-- Both options are visible with the current one marked, so the
             control no longer has to be clicked to find out what it does. -->
        <div class="day-switch" role="group" aria-label="Choose a day">
          <button
            class="day-option"
            class:selected={viewingToday}
            aria-pressed={viewingToday}
            onclick={() => showDay(todayKey)}
          >
            Today
          </button>
          <button
            class="day-option"
            class:selected={!viewingToday}
            aria-pressed={!viewingToday}
            onclick={() => showDay(tomorrowKey())}
          >
            Tomorrow
          </button>
        </div>
        
        <button 
          class="theme-toggle" 
          onclick={toggleTheme}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <svg class="theme-icon" class:rotated={darkMode} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            {#if darkMode}
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"/>
            {:else}
              <circle cx="12" cy="12" r="5" fill="currentColor"/>
              <line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2"/>
              <line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2"/>
              <line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2"/>
              <line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2"/>
            {/if}
          </svg>
        </button>
      </div>
    </div>
  </header>

  <main class="main">
    <div class="container">
      <div class="content-header">
        <h2 class="section-title">To-dos</h2>
        <div class="date-display">{currentDateDisplay}</div>
      </div>

      <div class="task-input-container">
        <input
          bind:value={newTask}
          type="text"
          placeholder="+ Add a task"
          class="task-input"
          onkeydown={handleInputKeydown}
        />
      </div>

      <div class="task-stats" class:visible={tasks.length > 0}>
        <span class="task-count">
          {remainingTasks} {remainingTasks === 1 ? 'task' : 'tasks'} remaining
        </span>
        {#if completedTasks > 0}
          <button class="clear-completed" onclick={clearCompleted}>
            Clear completed
          </button>
        {/if}
      </div>

      {#if carriedOver > 0 && viewingToday}
        <div class="carried-notice">
          <span>
            {carriedOver === 1
              ? 'One unfinished task carried over from an earlier day.'
              : `${carriedOver} unfinished tasks carried over from earlier days.`}
          </span>
          <button class="carried-dismiss" onclick={dismissCarriedOver} aria-label="Dismiss">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      {/if}

      <div class="task-list">
        {#key selectedKey}
          {#if tasks.length === 0}
            <div class="empty-state" transition:fade={{ duration: reduceMotion ? 0 : 200 }}>
              <svg class="empty-art" viewBox="0 0 120 120" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
                <g class="empty-art-motes" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  <path d="M40 34 L40 34" />
                  <path d="M60 26 L60 26" />
                  <path d="M80 34 L80 34" />
                </g>
                <g class="empty-art-box" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M30 58 L30 92 L90 92 L90 58" />
                  <path d="M24 58 L96 58" />
                  <path d="M30 58 L18 45" />
                  <path d="M90 58 L102 45" />
                  <path d="M48 74 L72 74" opacity="0.35" />
                </g>
              </svg>
              <p>No tasks yet. Add one above to get started!</p>
            </div>
          {:else}
            <ul class="task-items">
            {#each tasks as task, index (task.id)}
              <!-- The row is not itself focusable. Its handlers act on events
                   bubbling up from the buttons inside it, and every action they
                   provide is reachable from the keyboard: Delete removes a task,
                   Alt+Arrow reorders one. -->
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <li
                class="task-item"
                data-task-id={task.id}
                class:completed={task.completed}
                class:dragging={task.id === draggedId}
                class:settling={task.id === settlingId}
                style={rowStyle(task.id)}
                animate:flip={{ duration: (reduceMotion || task.id === draggedId) ? 0 : 240, easing: cubicOut }}
                in:fly={flyIn(index)}
                out:fly={flyOut(index)}
                onpointerdown={(e) => handlePointerDown(e, index)}
                onpointermove={handlePointerMove}
                onpointerup={handlePointerUp}
                onpointercancel={endDrag}
                onkeydown={(e) => handleTaskKeydown(e, task.id)}
              >
                <button
                  class="checkbox"
                  class:checked={task.completed}
                  onclick={() => toggleTask(task.id)}
                  aria-pressed={task.completed}
                  aria-label={task.text}
                >
                  {#if task.completed}
                    <svg class="checkmark" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12L11 14L15 10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  {/if}
                </button>
                
                {#if task.id === editingId}
                  <input
                    class="task-edit"
                    type="text"
                    bind:value={editingText}
                    onkeydown={handleEditKeydown}
                    onblur={commitEdit}
                    use:focusOnMount
                    aria-label="Edit {task.text}"
                  />
                {:else}
                  <button class="task-text" onclick={() => startEditing(task)} title="Click to edit">
                    {task.text}
                  </button>
                {/if}
                
                <button
                  class="row-btn defer-btn"
                  onclick={() => deferTask(task.id)}
                  title={viewingToday ? 'Move to Tomorrow' : 'Move to Today'}
                  aria-label={viewingToday ? `Move ${task.text} to Tomorrow` : `Move ${task.text} to Today`}
                >
                  {#if viewingToday}
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M13 6L19 12L13 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  {:else}
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M19 12H5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M11 6L5 12L11 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  {/if}
                </button>

                <button
                  class="row-btn delete-btn"
                  onclick={() => deleteTask(task.id)}
                  aria-label="Delete {task.text}"
                >
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <polyline points="3,6 5,6 21,6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M19,6V20A2,2 0 0,1 17,22H7A2,2 0 0,1 5,20V6M8,6V4A2,2 0 0,1 10,2H14A2,2 0 0,1 16,4V6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <line x1="10" y1="11" x2="10" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <line x1="14" y1="11" x2="14" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </li>
            {/each}
            </ul>
          {/if}
        {/key}
      </div>

      <footer class="data-footer">
        <button class="data-link" onclick={exportTasks}>Export</button>
        <span class="data-sep" aria-hidden="true">·</span>
        <button class="data-link" onclick={() => fileInput.click()}>Import</button>
        <input
          bind:this={fileInput}
          type="file"
          accept="application/json,.json"
          class="visually-hidden"
          onchange={importTasks}
        />
        <span class="data-status" class:error={statusIsError} role="status" aria-live="polite">
          {status}
        </span>
      </footer>
    </div>
  </main>
</div>

{#if undoNotice}
  <div class="undo-toast" role="status" aria-live="polite" transition:fly={{ y: reduceMotion ? 0 : 12, duration: reduceMotion ? 0 : 200, easing: cubicOut }}>
    <span class="undo-message">{undoNotice}</span>
    <button class="undo-action" onclick={undo}>
      Undo <kbd class="undo-key">{shortcutLabel}</kbd>
    </button>
  </div>
{/if}
