<script>
  import { onMount, tick } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import './style.css';

  import { toKey, addDays, fromKey, labelFor, formatLong } from './lib/dates.js';
  import { createStorage } from './lib/storage.js';
  import { rollover, msUntilNextMidnight } from './lib/rollover.js';
  import * as taskOps from './lib/tasks.js';
  import { createUndoStack, applyUndo } from './lib/undo.js';

  const storage = createStorage();
  const undoStack = createUndoStack();

  let tasks = $state([]);
  let newTask = $state('');
  // Seeded from the class the pre-paint script in index.html already set, so
  // there is one source of truth and no post-mount correction to flash.
  let darkMode = $state(document.documentElement.classList.contains('dark'));
  let isInitialized = false;
  let todayKey = $state(toKey(new Date()));
  let selectedKey = $state(toKey(new Date()));
  let draggedItem = $state(null);
  let draggedOverIndex = $state(null);
  let midnightTimer = null;

  /** Single write path, so persistence cannot drift out of step with the list.
   *  Loading a different day assigns `tasks` directly and deliberately skips
   *  this — there is nothing new to save. */
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
  }

  function undo() {
    const entry = undoStack.pop();
    if (entry) setTasks(applyUndo(tasks, entry));
  }

  function toggleTheme() {
    darkMode = !darkMode;
  }

  /** Scoped to the input. Previously this also sat on window, so Enter while a
   *  task was focused would toggle that task *and* add whatever was in the
   *  input. */
  function handleInputKeydown(event) {
    if (event.key === 'Enter') addTask();
    else if (event.key === 'Escape') newTask = '';
  }

  function handleGlobalKeydown(event) {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    // Leave the text field its own native undo.
    if (event.target instanceof HTMLInputElement) return;
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
    }
  }

  // Reordering runs on Pointer Events rather than HTML5 drag-and-drop, which
  // never fired on touch at all — so a documented feature was desktop-only.
  //
  // Touch and mouse need different entry conditions. A mouse drag begins once
  // the pointer has moved past a small threshold. A touch drag cannot, because
  // a vertical swipe on a list is far more likely to mean "scroll"; it begins
  // on a long press instead, and any movement before that cancels the intent
  // and lets the page scroll normally.
  const DRAG_THRESHOLD_PX = 8;
  const LONG_PRESS_MS = 400;

  let drag = null;

  function blockTouchScroll(event) {
    event.preventDefault();
  }

  function beginDrag() {
    if (!drag || drag.active) return;
    drag.active = true;
    draggedItem = drag.index;
    draggedOverIndex = drag.index;

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
    draggedItem = null;
    draggedOverIndex = null;
  }

  function targetIndexFor(clientY) {
    const rows = [...drag.row.parentElement.children];
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return rows.length - 1;
  }

  function handlePointerDown(event, index) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // Let the checkbox and delete button have their clicks.
    if (event.target.closest('button')) return;

    drag = {
      index,
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

    draggedOverIndex = targetIndexFor(event.clientY);
  }

  function handlePointerUp() {
    if (!drag) return;

    if (drag.active && draggedOverIndex !== null && draggedOverIndex !== drag.index) {
      setTasks(taskOps.reorderTask(tasks, drag.index, draggedOverIndex));
    }

    endDrag();
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

  function switchDate() {
    selectedKey = selectedKey === todayKey ? tomorrowKey() : todayKey;
    tasks = storage.loadTasks(selectedKey);
  }

  /**
   * Re-evaluates the day boundary and reloads the visible list. Safe to call
   * repeatedly — rollover is idempotent within a day.
   *
   * If the day changed while the user was looking at Today, they stay on the
   * new Today. If they were looking at Tomorrow, that key has become Today and
   * they follow it there, which preserves the existing mental model.
   */
  function runRollover() {
    const now = new Date();
    const wasViewingToday = selectedKey === todayKey;

    todayKey = toKey(now);
    const todayTasks = rollover(storage, now);

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

  function handleVisibility() {
    if (document.visibilityState === 'visible') runRollover();
  }

  const currentDateDisplay = $derived(formatLong(selectedKey));
  const buttonText = $derived(labelFor(selectedKey, todayKey));

  const remainingTasks = $derived(tasks.filter(task => !task.completed).length);
  const completedTasks = $derived(tasks.filter(task => task.completed).length);

  $effect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    if (!isInitialized) return;
    storage.saveTheme(darkMode ? 'dark' : 'light');
  });

  onMount(() => {
    storage.migrateLegacyKeys();
    runRollover();
    isInitialized = true;

    // Four triggers, because no single one is sufficient. The timer covers a
    // pinned tab crossing midnight unattended; visibility and focus cover
    // machine sleep, where timers do not reliably fire.
    scheduleMidnight();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', runRollover);

    return () => {
      clearTimeout(midnightTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', runRollover);
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
        <button class="today-btn" aria-label="Switch between Today and Tomorrow" onclick={switchDate}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
            <line x1="16" y1="2" x2="16" y2="6" stroke="currentColor" stroke-width="2"/>
            <line x1="8" y1="2" x2="8" y2="6" stroke="currentColor" stroke-width="2"/>
            <line x1="3" y1="10" x2="21" y2="10" stroke="currentColor" stroke-width="2"/>
          </svg>
          {buttonText}
        </button>
        
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

      <div class="task-list">
        {#key selectedKey}
          {#if tasks.length === 0}
            <div class="empty-state" transition:fade={{ duration: 200 }}>
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
                class:dragging={draggedItem === index}
                class:drag-over={draggedOverIndex === index && draggedItem !== index}
                in:fly={{ y: -10, duration: 300, delay: index * 30, easing: cubicOut }}
                out:fly={{ x: 30, opacity: 0, duration: 250, delay: index * 20, easing: cubicOut }}
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
                
                <span class="task-text">{task.text}</span>
                
                <button
                  class="delete-btn"
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
    </div>
  </main>
</div>
